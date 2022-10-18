'use strict';
const Context = require('./context');
const Module = require('./module');
const path = require('path');
const fs = require('fs');
const requirejs = require('./index');
const parser = require('@babel/parser');
const {isCandidateFilename, convert} = require('koru/amd-loader/async-convert');

Context.Module = Module;
Context.setGlobalName('requirejs');

const runtimePluginFetch = Module.Plugin.prototype.fetch;

const filename = (mod) => `/${mod.id}.js`;

const ReservedName = {
  require: true,
  exports: true,
  module: true,
};

const CommonNodeEntry = {
  loc: true,
  errors: true,
  innerComments: true,
  leadingComments: true,
  trailingComments: true,
  extra: true,
  range: true,
};

const newNode = (node, type) => {
  const nn = new node.constructor(undefined, node.start, node.loc);
  nn.type = type;
  nn.end = node.end;
  return nn;
};

const newStringLiteral = (node, value) => {
  const nn = newNode(node, 'StringLiteral');
  nn.value = value;
  return nn;
};

const newArrayExpression = (node, elements) => {
  const nn = newNode(node, 'ArrayExpression');
  nn.elements = elements;
  return nn;
};

module.exports.parse = parser.parse;

const walk = (ast, callback) => {
  for (const key in ast) {
    const node = ast[key];
    if (typeof node === 'object' && node !== null && CommonNodeEntry[key] === undefined) {
      if (Array.isArray(node)) {
        for (const n of node) {
          switch (callback(n)) {
          case 0: return 0;
          case 1: if (walk(n, callback) == 0) return 0;
          }
        }
      } else {
        switch (callback(node)) {
        case 0: return 0;
        case 1: if (walk(node, callback) == 0) return 0;
        }
      }
    }
  }
  return 1;
};

const walkArray = (ast, callback) => {
  for (const n of ast) {
    switch (callback(n)) {
    case 0: return 0;
    case 1: if (walk(n, callback) == 0) return 0;
    }
  }
  return 1;
};

const compile = module.exports.compile = ({
  name, toplevel, onBuildRead, hierarchy, contextConfig, callback,
}) => {
  const runtimeCtx = requirejs.config(contextConfig);
  const origMainCtx = Module.mainCtx;
  const compileCtx = Module.mainCtx = new Context(contextConfig);
  compileCtx.loadModule = function (mod) {
    const oldCtx = Module.currentCtx;
    const ctx = Module.currentCtx = this;
    try {
      const {uri} = mod;
      const data = fs.readFileSync(uri);
      if (isCandidateFilename(uri)) convert(data);
      parseContents(mod, data.toString());
    } catch (ex) {
      throw ex;
    } finally {
      Module.currentCtx = oldCtx;
    }
  }

  const parse = (codeIn, codeFilename) => {
    try {
      return parser.parse(codeIn, {sourceType: 'script', sourceFilename: codeFilename}).program;
    } catch (ex) {
      if (ex.filename && ex.line) {
        const m = /^(.*)+\s\((\d+:\d+)\)/.exec(ex.message);
        throw new SyntaxError(`${m[1]}\n    at ${codeFilename}:${m[2]}`);
      } else {
        throw ex;
      }
    }
  };

  const addCode = (ast, mod) => {
    if (toplevel === undefined) {
      toplevel = ast;
    } else {
      const b = ast.body;
      const {body} = toplevel.program === undefined ? toplevel : toplevel.program;
      for (let i = 0; i < b.length; ++i) {
        body.push(b[i]);
      }
    }
  };

  const globalDefine = global.define;
  global.define = Module.define;

  const _comp = () => {
    global.define = globalDefine; // restore define in global environment

    callback({ast: toplevel, name});

    toplevel = undefined;

    global.define = Module.define;
  };

  const origPluginfetch = Module.Plugin.prototype.fetch;
  Module.Plugin.prototype.fetch = function (name, parent) {
    const pluginMod = this.mod;
    if (pluginMod.ctx !== compileCtx) return runtimePluginFetch.call(this, name, parent);

    let loader, loaderMod;

    const loaderCallback = (arg, mod) => {loader = arg, loaderMod = mod};
    runtimeCtx.require(pluginMod.id, loaderCallback);
    if (loader.pluginBuilder) {
      runtimeCtx.require(loaderMod.normalizeId(loader.pluginBuilder), loaderCallback);
    }
    name = loader.normalize ? loader.normalize(name, parent) : parent.normalizeId(name);
    const id = pluginMod.id + '!' + name;
    const modules = pluginMod.ctx.modules;
    const resMod = modules[id];

    if (resMod) return resMod;

    const mod = new Module(pluginMod.ctx, id, Module.WAIT_PLUGIN);

    const onLoad = (value) => {
      if (value !== undefined) {
        mod.exports = value;
      }
      mod.state = Module.READY;
      Module._informDependants(mod);
    };

    onLoad.error = () => {};
    onLoad.fromText = (code) => {parseContents(mod, code)};

    loader.load(name, mod.require, onLoad);

    const onWrite = (code) => {
      addCode(parse(code, filename(mod)), mod);
    };
    loader.write && loader.write(pluginMod.id, name, onWrite);
    return mod;
  }

  const parseContents = (mod, code) => {
    if (onBuildRead !== undefined) code = onBuildRead(mod, code).toString();
    const ast = parse(code, filename(mod));

    const depsMap = {};
    let deps;

    const addDep = (name) => {
      const match = /^([^!]+)!(.*)$/.exec(name);
      if (match) {
        mod.require(name, (_, mod) => {name = mod.id});
      }
      name = mod.normalizeId(name);
      if (name && ! depsMap[name]) {
        depsMap[name] = true;
        deps.push(name);
      }
    };

    const lookForReq = (node) => {
      if (node.type === 'CallExpression' && node.callee.name === 'require' && node.arguments.length === 1) {
        const arg = node.arguments[0];
        if (arg.type === 'StringLiteral') {
          addDep(arg.value);
        }
      }
      return 1;
    };

    walk(ast, (node) => {
      if (node.type === 'CallExpression' && node.callee.name === 'define') {
        let [name, deps1, body] = node.arguments;
        if (deps1 === undefined) {
          body = name; name = undefined;
        } else {
          if (body === undefined) {
            body = deps1;
            if (name.type === 'StringLiteral') {
              deps1 = undefined;
            } else {
              deps1 = name; name = undefined;
            }
          }
        }
        if (name === undefined) {
          name = newStringLiteral(node, mod.id);
        }

        if (deps1 !== undefined) {
          deps = [];
          deps1.elements.forEach((node) => addDep(node.value));
        } else if (body !== undefined) {
          if ((body.type === 'ArrowFunctionExpression' || body.type === 'FunctionExpression') &&
              body.params.length != 0) {
            deps = [];
            node.arguments = [name, null, body];
            body.params.forEach((node) => {
              node.type == 'Identifier' && ReservedName[node.name] !== undefined && addDep(node.name);
            });
            walkArray(Array.isArray(body.body) ? body.body : [body.body], lookForReq);
          }
        }
        if (deps !== undefined) {
          node.arguments = [
            name,
            newArrayExpression(node, deps.map((name) => newStringLiteral(node, name))),
            body];
        } else {
          node.arguments = [name, body];
        }
        return 0;
      }
      return 1;
    });

    Module._prepare(mod, deps, () => {addCode(ast, mod)});
  };

  try {
    if (hierarchy === undefined) {
      compileCtx.require(name, _comp);
    } else {
      for (const n of hierarchy) {
        name = n;
        compileCtx.require(n, _comp);
      }
    }
  } finally {
    // restore intercepts
    Module.mainCtx = origMainCtx;
    global.define = globalDefine;
    Module.Plugin.prototype.fetch = origPluginfetch;
  }
};

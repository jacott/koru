const path = require('path');
const vm = require('vm');
const fs = require('fs');

const Context = require('./context');
const Module = require('./module');

Context.Module = Module;
Context.prototype.undef = () => {};

Context.prototype.readFileSync = fs.readFileSync;

Context.prototype.loadModule = function (mod) {
  const oldCtx = Module.currentCtx;
  Module.currentCtx = this;
  try {
    vm.runInThisContext(wrap(mod, this.readFileSync(mod.uri)), {
      filename: mod.uri, displayErrors: true, timeout: 5000});

    if (mod.state > Module.LOADING) {
      return;
    }
  } catch (ex) {
    if (ex.code === 'ENOENT') {
      try {
        mod.exports = requirejs.nodeRequire(mod.id);
        mod.state = Module.LOADED;
        this.waitReady[mod.id] = mod;
        mod._ready();
        return;
      } catch (ex2) {
        if (ex2.code !== 'MODULE_NOT_FOUND') {
          ex = ex2;
        }
      }
      ex.onload = true;
    }
    ex.module = mod;
    mod._error(ex);
    return;
  } finally {
    Module.currentCtx = oldCtx;
  }

  const gdr = Module._globalDefineResult;
  Module._globalDefineResult = null;
  if (gdr == null) {
    return mod._nodefine();
  }

  Module._prepare(mod, gdr[1], gdr[2], gdr[3]);
}

let globalName = 'requirejs';

const wrap = (mod, code) => '{const {define, nodeRequire: require, requirejs: ' +
      globalName + '} = __requirejsVars__; ' + code +
      '}';

Context.setGlobalName = (value) => {globalName = value};

Context._onConfig = (ctx) => {
  global.__requirejsVars__ = {
    define: Module.define,
    nodeRequire: ctx.nodeRequire ?? require,
    requirejs: module.exports,
  };
};

const mainCtx = Module.currentCtx = new Context({baseUrl: __dirname});
const requirejs = module.exports = mainCtx.require;
requirejs.config = mainCtx.config.bind(mainCtx);

requirejs.ensureClientLoader = () => {
  const destName = path.join(__dirname, '.build/index.js');
  const dest = fs.statSync(destName, {throwIfNoEntry: false})?.mtime;
  const inputs = ['browser-template.js', 'context.js', 'module.js'].map((n) => path.join(__dirname, n));
  for (const n of inputs) {
    if (dest === undefined || fs.statSync(n).mtime > dest) {
      const tpl = fs.readFileSync(inputs[0]);
      const context = `(()=>{
${fs.readFileSync(inputs[1])}})();`;
      const module = `(()=>{
${fs.readFileSync(inputs[2])}})();`;

      fs.mkdirSync(path.join(__dirname, '.build'), {recursive: true});
      fs.writeFileSync(destName, tpl.toString().replace(
        /___INSERT___/, `
const module = {};
${context}
const Context = module.exports;
${module}
const Module = module.exports;
`));
      break;
    }
  }
  return destName;
};

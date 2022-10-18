#!/usr/bin/env node
Error.stackTraceLimit = 100;

const Path = require('path');
const fs = require('fs');

const requirejs = require('./amd-loader');
requirejs.nodeRequire = require;

const compiler = require('./amd-loader/compiler');

exports.bundle = (options={}, callback) => {
  const topDir = options.topDir || Path.resolve(Path.join(process.cwd(), 'app'));

  process.chdir(topDir);

  const cfg = require('./build-conf')(process.argv[2]);
  const configCode = (cfg.client.topLevelConsts ?? 'const isTest = false, isClient = true, isServer = false') +
        ';window.requirejs = window.requirejs;requirejs.config(' +
        cfg.stringify(cfg.client.requirejs) + ');\n';

  const contextConfig = cfg.setTarget(cfg.client.requirejs);

  const clientjs = cfg.server.clientjs;

  Object.assign(contextConfig, {
    baseUrl: topDir,
  });

  try {
    let toplevel;
    const {hash} = options;
    if (! options.excludeConfig) {
      const requirejsCode = fs.readFileSync(requirejs.ensureClientLoader()).toString();
      if (hash !== undefined) hash.update(requirejsCode);
      toplevel = compiler.parse(requirejsCode, {sourceFilename: 'index.js'});
      const cfgjs = compiler.parse(configCode, {sourceFilename: '__config__.js'});
      toplevel.program.body.push(...cfgjs.program.body);
    }

    compiler.compile({
      contextConfig, toplevel,
      onBuildRead(module, contents) {
        if (module.id === 'koru/css/loader') {
          contents = 'define({loadAll(){}});';
        } else if (module.id === 'client') {
          contents = fs.readFileSync(Path.join(topDir, clientjs + '.js')).toString();
        }

        if (hash !== undefined) hash.update(contents);
        return contents;
      },

      hierarchy: options.hierarchy,

      name: 'client',

      callback({ast, name}) {
        callback({ast, name, compiler, configCode, options});
      }});
  } catch (ex) {
    process.stderr.write(ex.stack);
    process.exit(1);
  }
};

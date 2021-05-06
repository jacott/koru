#!/usr/bin/env node
Error.stackTraceLimit = 100;

const Path = require('path');
const fs = require('fs');
const Fiber = require('fibers');

const yaajs = require('yaajs');
yaajs.nodeRequire = require;

const compiler = require('yaajs/lib/compiler');

exports.bundle = (options={}, callback)=>{
  const topDir = options.topDir || Path.resolve(Path.join(process.cwd(), 'app'));

  process.chdir(topDir);

  const cfg = require('./build-conf')(process.argv[2]);
  const configCode = (cfg.client.topLevelConsts ?? "const isTest = false, isClient = true, isServer = false") +
        ";window.requirejs = window.yaajs;yaajs.config(" +
        cfg.stringify(cfg.client.requirejs) + ");\n";

  const contextConfig = cfg.setTarget(cfg.client.requirejs);

  const clientjs = cfg.server.clientjs;

  Object.assign(contextConfig, {
    baseUrl: topDir,
  });

  Fiber(()=>{
    try {
      let toplevel;
      const {hash} = options;
      if (! options.excludeConfig) {
        const yaajsCode = fs.readFileSync(require.resolve('yaajs/yaa.js')).toString();
        if (hash !== void 0) hash.update(yaajsCode);
        toplevel = compiler.parse(yaajsCode, {sourceFilename: 'index.js'});
        const cfgjs = compiler.parse(configCode, {sourceFilename: '__config__.js'});
        toplevel.program.body.push(...cfgjs.program.body);
      };

      compiler.compile({
        contextConfig, toplevel,
        onBuildRead(moduleName, contents) {
          if (moduleName === 'koru/css/loader')
            contents = "define({loadAll(){}});";
          else if (moduleName === 'client')
            contents = fs.readFileSync(Path.join(topDir, clientjs+".js")).toString();

          if (hash !== void 0) hash.update(contents);
          return contents;
        },

        hierarchy: options.hierarchy,

        name: 'client',

        callback({ast, name}) {
          callback({ast, name, compiler, configCode, options});
        }});
    } catch(ex) {
      process.stderr.write(ex.stack);
      process.exit(1);
    }
  }).run();
};

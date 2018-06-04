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
  const buildDir = options.buildDir || Path.resolve(Path.join(process.cwd(), 'build'));

  process.chdir(topDir);

  const cfg = require('./build-conf')(process.argv[2]);
  const configCode = "const isClient = true, isServer = false;yaajs.config(" + cfg.stringify(cfg.client.requirejs) + ");\n";

  const optConfig = cfg.setTarget(cfg.client.requirejs);

  const clientjs = cfg.server.clientjs;

  Object.assign(optConfig, {
    baseUrl: topDir,

    onBuildRead(moduleName, contents) {
      if (moduleName === 'koru/css/loader')
        return "define({loadAll(){}});";

      if (moduleName === 'client') {
        contents = fs.readFileSync(Path.join(topDir, clientjs+".js")).toString();
        return contents;
      }

      return contents;
    },

    hierarchy: options.hierarchy,

    name: 'client',
    out: Path.join(buildDir, "/index.js"),
  });

  try {fs.mkdirSync(buildDir);} catch(ex) {}

  const astConfig = {
    parse: {},
    compress: false,
    mangle: false,
    output: {
      ast: true,
      code: false,
    }
  };

  const parse = (codeIn, codeFilename)=> compiler.parse(codeIn, astConfig).ast;

  Fiber(()=>{
    try {
      let excludeConfig = options.excludeConfig;
      compiler.compile(optConfig, ({ast, code: codeMap, name})=>{
        ast.directives = [];
        ast.sourceType = 'script';

        if ( ! excludeConfig) {
          excludeConfig = true;
          const yaajsCode = fs.readFileSync(require.resolve('yaajs/yaa.js')).toString();
          codeMap['/index.js'] = yaajsCode;
          const yaajsAst = parse(yaajsCode, '/index.js');
          codeMap['/__config__.js'] = configCode;
          var configCodeAst = parse(configCode, '/__config__.js');
          ast.body.splice(0, 0, yaajsAst, configCodeAst);
        }

        callback({ast, code: codeMap, configCode, configCodeAst, name});
      });
    } catch(ex) {
      process.stderr.write(ex.stack);
      process.exit(1);
    }
  }).run();
};

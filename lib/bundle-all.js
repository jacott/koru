#!/usr/bin/env node
Error.stackTraceLimit = 100;

const Path = require('path');
const fs = require('fs');
const Fiber = require('fibers');

const bundleCss = require('./bundle-css');

const yaajs = require('yaajs');
yaajs.nodeRequire = require;

const compiler = require('yaajs/lib/compiler');
const {parse} = require('babylon');
const generate = require('babel-generator').default;

function merge(dest, source) {
  for(var prop in source) {
    const desc = Object.getOwnPropertyDescriptor(source, prop);
    desc && Object.defineProperty(dest, prop, desc);
  }
  return dest;
}

exports.bundle = function (options, callback) {
  options = options || {};
  var topDir = options.topDir || Path.resolve(Path.join(process.cwd(), 'app'));
  var buildDir = options.buildDir || Path.resolve(Path.join(process.cwd(), 'build'));

  process.chdir(topDir);

  const cfg = require('./build-conf')(process.argv[2]);
  const cfgStr = "const isClient = true, isServer = false;yaajs.config(" + cfg.stringify(cfg.client.requirejs) + ");\n";

  const optConfig = cfg.setTarget(cfg.client.requirejs);

  const clientjs = cfg.server.clientjs;
  console.log(clientjs);

  merge(optConfig, {
    baseUrl: topDir,

    onBuildRead: function (moduleName, contents) {
      if (moduleName === 'koru/css/loader')
        return "define({loadAll: function(){}});";

      if (moduleName === 'client') {
        contents = fs.readFileSync(Path.join(topDir, clientjs+".js")).toString();
        return contents;
      }

      return contents;
    },

    name: 'client',
    out: Path.join(buildDir, "/index.js"),
  });

  try {fs.mkdirSync(buildDir);} catch(ex) {}

  Fiber(function () {
    try {
      const css = bundleCss(topDir, ['ui']);

      compiler.compile(optConfig, function ({ast, code: codeMap}) {

        if ( ! options.excludeConfig) {
          const yaajsCode = fs.readFileSync(require.resolve('yaajs/yaa.js')).toString();
          codeMap['/index.js'] = yaajsCode;
          const yaajsAst = parse(yaajsCode, {sourceType: 'module', sourceFilename: '/index.js'}).program;
          codeMap['/__config__.js'] = cfgStr;
          const cfgStrAst = parse(cfgStr, {sourceType: 'module', sourceFilename: '/__config__.js'}).program;
          ast.body.splice(0, 0, yaajsAst, cfgStrAst);
        }

        if (callback) {
          callback({ast, code: codeMap, css});
          return;
        }

        console.log('generate...');
        const { code, map } = generate(ast, {
          comments: false,
          compact: true,
          sourceMaps: true,
        }, codeMap);
        console.log('done');

        fs.writeFileSync(Path.join(buildDir, 'index.css'), css);
        fs.writeFileSync(optConfig.out, code);
        fs.writeFileSync(optConfig.out+'.map', JSON.stringify(map));
      });
    } catch(ex) {
      process.stderr.write(ex.stack);
      process.exit(1);
    }
  }).run();
};

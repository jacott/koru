#!/usr/bin/env node
Error.stackTraceLimit = 50;

var Path = require('path');
var fs = require('fs');
var Fiber = require('fibers');

var bundleCss = require('./bundle-css');

var yaajs = require('yaajs');
yaajs.nodeRequire = require;

var compiler = require('yaajs/lib/compiler');

exports.bundle = function (options, topDir, buildDir) {
  topDir = topDir || Path.resolve(Path.join(process.cwd(), 'app'));
  buildDir = buildDir || Path.resolve(Path.join(process.cwd(), 'build'));

  process.chdir(topDir);

  var cfg = require('./build-conf');
  var cfgStr = "yaajs.config(" + cfg.stringify(cfg.client.requirejs) + ");\n";

  var optConfig = cfg.setTarget(cfg.client.requirejs);

  var clientjs = cfg.server.clientjs;
  console.log(clientjs);

  cfg.extend(optConfig, {
    // optimize: 'none',
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

  options && cfg.extend(optConfig, options);

  try {fs.mkdirSync(buildDir);} catch(ex) {}

  Fiber(function () {
    try {
      fs.writeFileSync(Path.join(buildDir, 'index.css'), bundleCss(topDir, ['ui']));

      compiler.compile(optConfig, function (codeTree) {
        var code = ["window.isServer = false; window.isClient = true;\n", fs.readFileSync(Path.join(__dirname, '../node_modules/yaajs/yaa.js')), cfgStr];
        for (;codeTree; codeTree = codeTree.next) {
          code.push(codeTree.code);
        }
        fs.writeFileSync(optConfig.out, code.join("\n"));
      });
    } catch(ex) {
      process.stderr.write(ex.stack);
      process.exit(1);
    }
  }).run();
};

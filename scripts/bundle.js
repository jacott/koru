#!/usr/bin/env node

var Fiber = require('koru/node_modules/fibers');
var bundleCss = require('koru/lib/bundle-css');
var Path = require('path');
var fs = require('fs');

var requirejs = require('koru/node_modules/requirejs');

var topDir = Path.resolve(Path.join(__dirname, '../app'));
var buildDir = Path.resolve(Path.join(__dirname, '../build'));

process.chdir(topDir);
var cfg = require('koru/lib/build-conf');

var cfgStr = "yaajs.config(" + JSON.stringify(cfg.client.requirejs) + ");\n";

var optConfig = cfg.setTarget(cfg.client.requirejs);

cfg.merge("paths", {
  requireLib: Path.join(cfg.rootDir, "node_modules/koru/node_modules/requirejs/require"),
});

var clientjs = cfg.server.clientjs;
console.log(clientjs);

cfg.extend(optConfig, {
  include: 'requireLib',
  // optimize: 'none',

  stubModules: ['koru/dom/template-compiler'],

  onBuildRead: function (moduleName, path, contents) {
    if (moduleName === 'koru/css/loader')
      return "define({loadAll: function(){}});";

    if (moduleName === clientjs) {
      return cfgStr + contents;
    }

    return contents;
  },

  name: clientjs,
  out: Path.join(buildDir, "/index.js"),
});

try {fs.mkdirSync(buildDir);} catch(ex) {}

Fiber(function () {
  try {
    fs.writeFileSync(Path.join(buildDir, 'index.css'), bundleCss(topDir, ['ui']));

    requirejs.optimize(optConfig, function (buildResponse) {

    });
  } catch(ex) {
    process.stderr.write(ex.stack);
    process.exit(1);
  }
}).run();

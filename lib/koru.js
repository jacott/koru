var path = require('path');
var fs = require('fs');
var vm = require('vm');

var orig_runInThisContext = vm.runInThisContext;

vm.runInThisContext = function (src, filename, verbose) {
  if (arguments.length === 2) try {
    return orig_runInThisContext.call(vm, src, filename, true);
  } catch(ex) {
    if (ex.constructor === SyntaxError) {
      ex.message = ex.message + '\n\tat when_loading (' + filename + ':1)';
    }
    throw ex;
  }

  return orig_runInThisContext.apply(vm, arguments);
};

var cfg = require('./build-conf');
var requirejs = require('../node_modules/requirejs');

var rootDir = cfg.rootDir;
var client = cfg.client;
var server = cfg.server;

var clientjs = "requirejs.config(" + JSON.stringify(client.requirejs) + ");\n" +
fs.readFileSync(path.join(server.requirejs.baseUrl, server.clientjs) +'.js');

function sendClientjs(req, res) {
  res.writeHead(200, {
    'Content-Type': 'application/x-javascript',
  });
  res.end(clientjs);
}

var appName = path.basename(cfg.rootDir);
if (appName === cfg.envName) appName = '';
process.title = "koru " + cfg.envName + " " + appName;

requirejs.config(server.requirejs);

requirejs(['koru/main-server', 'koru/web-server', server.startup].concat(server.extraRequires||[]), function (koru, webServer, startup) {
  webServer.registerHandler('client.js', sendClientjs);
  koru.Fiber(function () {
    startup(server);
  }).run();
});

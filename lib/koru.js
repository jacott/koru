var path = require('path');
var fs = require('fs');
var Fiber = require('fibers');

Error.stackTraceLimit = 50;

var cfg = require('./build-conf');

var requirejs = require('yaajs');

requirejs.nodeRequire = require;

var rootDir = cfg.rootDir;
var client = cfg.client;
var server = cfg.server;

var clientjs = "yaajs.config(" + cfg.stringify(client.requirejs) + ");\n" +
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

var ctx = requirejs.module.ctx;
ctx.constructor.setGlobalName('requirejs');
ctx.config(server.requirejs);


Fiber(() => requirejs([
  'koru/server', 'koru/web-server', server.startup
].concat(server.extraRequires||[]), function (koru, webServer, startup) {
  webServer.registerHandler('client.js', sendClientjs);
  startup(server);
})).run();

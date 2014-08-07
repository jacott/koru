var path = require('path');
var fs = require('fs');

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

requirejs.config(server.requirejs);

requirejs(['koru', 'koru/web-server', server.startup].concat(server.extraRequires||[]), function (koru, webServer, startup) {
  webServer.registerHandler('client.js', sendClientjs);
  koru.Fiber(function () {
    typeof startup === 'function' && startup(server);
    webServer.start();

    console.log('=> Ready');
  }).run();
});

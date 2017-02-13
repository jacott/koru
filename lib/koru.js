const path = require('path');
const fs = require('fs');
const Fiber = require('fibers');

const isServer = global.isServer = true;
const isClient = global.isClient = false;

Error.stackTraceLimit = 50;

const cfg = require('./build-conf')(process.argv[2]);

const requirejs = require('yaajs');

requirejs.nodeRequire = require;

const rootDir = cfg.rootDir;
const client = cfg.client;
const server = cfg.server;

const clientjs = "const isClient = true, isServer = false;yaajs.config(" + cfg.stringify(client.requirejs) + ");\n" +
fs.readFileSync(path.join(server.requirejs.baseUrl, server.clientjs) +'.js');

function sendClientjs(req, res) {
  res.writeHead(200, {
    'Content-Type': 'application/x-javascript',
  });
  res.end(clientjs);
}

let appName = path.basename(cfg.rootDir);
if (appName === cfg.envName) appName = '';
process.title = "koru " + cfg.envName + " " + appName;

let {ctx} = requirejs.module;
ctx.constructor.setGlobalName('requirejs');
ctx.config(server.requirejs);

Fiber(() => requirejs([
  'koru/server', 'koru/web-server', server.startup
].concat(server.extraRequires||[]), function (koru, webServer, startup) {
  webServer.registerHandler('client.js', sendClientjs);
  startup(server);
})).run();

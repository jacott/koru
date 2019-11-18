const path = require('path');
const fs = require('fs');
const Fiber = require('fibers');
const requirejs = require('yaajs');

const {ctx} = requirejs.module;
requirejs.nodeRequire = require;

const {KORU_ENV, KORU_APP_NAME, KORU_HOME} = process.env;

if (! (KORU_ENV && KORU_HOME))
  throw new Error("KORU_ENV and KORU_HOME env vars are not configured");

const isTest = global.isTest = KORU_ENV === 'test' ? Symbol() : false;
const isClient = global.isClient = false;
const isServer = global.isServer = true;

Error.stackTraceLimit = 100;

const {rootDir, client, server, stringify} = require('./build-conf')(KORU_ENV, KORU_HOME);

let clientjs = '';

const sendClientjs = (req, res)=>{
  res.writeHead(200, {
    'Content-Type': 'application/x-javascript',
  });
  if (clientjs === '') {
    clientjs = "const isTest = " +
      (isTest ? "Symbol()" : "false") +
      ", isClient = true, isServer = false;yaajs.config(" +
      stringify(client.requirejs) + ");\n" +
      fs.readFileSync(path.join(server.requirejs.baseUrl, server.clientjs) +'.js');
  }
  res.end(clientjs);
};

process.title = `koru/${KORU_APP_NAME} ${KORU_ENV}`;

ctx.constructor.setGlobalName('requirejs');
ctx.config(server.requirejs);

Fiber(() => requirejs([
  'koru/server', 'koru/web-server', server.startup
].concat(server.extraRequires||[]), (koru, webServer, startup)=>{
  webServer.registerHandler('client.js', sendClientjs);
  startup(server);
})).run();

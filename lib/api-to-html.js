const yaajs = require('yaajs');
const cfg = require('./build-conf');
const Fiber = require('fibers');

global.requirejs = yaajs;
global.requirejs.nodeRequire = require;

Error.stackTraceLimit = 50;

const rootDir = cfg.rootDir;
const client = cfg.client;
const server = cfg.server;

yaajs.config(server.requirejs);

Fiber(function () {
  const deps = ['koru/main', 'koru/test/api-to-html',
                ...(server.extraRequires||[])];
  yaajs(deps, function (koru, toHtml) {
    new toHtml(process.argv.slice(3));
    process.exit(0);
  });
}).run();

const cfg = require('./build-conf');
const yaajs = require('yaajs');
const Fiber = require('fibers');

global.requirejs = yaajs;
global.requirejs.nodeRequire = require;

Error.stackTraceLimit = 50;

const rootDir = cfg.rootDir;
const client = cfg.client;
const server = cfg.server;

yaajs.config(server.requirejs);

Fiber(function () {
  const deps = ['koru/main', 'koru/migrate/migration', 'koru/config!DBDriver',
                ...(server.extraRequires||[])];
  yaajs(deps, function (koru, Migration, DBDriver) {
    new Migration(DBDriver.defaultDb).migrateTo(process.argv[3], process.argv[4], "verbose");
    process.exit(0);
  });
}).run();

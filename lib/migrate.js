const path = require('path');
const fs = require('fs');
const vm = require('vm');
const cfg = require('./build-conf');
const yaajs = require('yaajs');

global.requirejs = yaajs;
global.requirejs.nodeRequire = require;

Error.stackTraceLimit = 50;

const rootDir = cfg.rootDir;
const client = cfg.client;
const server = cfg.server;

yaajs.config(server.requirejs);

yaajs(['koru/main', 'koru/migrate/migration', 'koru/config!DBDriver']
      .concat(server.extraRequires||[]), function (koru, Migration, DBDriver) {
          koru.Fiber(function () {
            try {
              new Migration(DBDriver.defaultDb).migrateTo(process.argv[3], process.argv[4], "verbose");
            } catch(ex) {
              koru.error(ex.stack);
              process.exit(1);
            }
            process.exit(0);
          }).run();
        });

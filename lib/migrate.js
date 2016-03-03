var path = require('path');
var fs = require('fs');
var vm = require('vm');
var cfg = require('./build-conf');
var yaajs = require('yaajs');

global.requirejs = yaajs;
global.requirejs.nodeRequire = require;

Error.stackTraceLimit = 50;

var rootDir = cfg.rootDir;
var client = cfg.client;
var server = cfg.server;

yaajs.config(server.requirejs);

yaajs(['koru/main-server', 'koru/migrate/migration', 'koru/config!DBDriver']
        .concat(server.extraRequires||[]), function (koru, migration, DBDriver) {
          koru.Fiber(function () {
            try {
              migration.migrateTo(DBDriver.defaultDb, process.argv[3], process.argv[4], "verbose");
            } catch(ex) {
              koru.error(ex.stack);
              process.exit(1);
            }
            process.exit(0);
          }).run();
        });

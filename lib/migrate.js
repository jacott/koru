var path = require('path');
var fs = require('fs');
var vm = require('vm');

var orig_runInThisContext = vm.runInThisContext;

Error.stackTraceLimit = 50;

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

requirejs.config(server.requirejs);

requirejs(['koru/main-server', 'koru/migrate/migration', 'koru/config!DBDriver']
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

define(function(require, exports, module) {
  const util     = require('./util-server');

  return function (koru) {
    global._koru_ = koru;


    koru.reload = function () {
      if (koru.loadError) throw koru.loadError;
      console.log('=> Reloading');

      var argv = process.argv.slice(0,1).concat(process.execArgv.concat(process.argv.slice(1)));
      requirejs.nodeRequire('bindings')('koru_restart.node')
        .execv(process.execPath, argv);
    };

    koru.Fiber = util.Fiber;

    koru.onunload(module, 'reload');

    koru.appDir = koru.config.appDir || module.toUrl('').slice(0,-1);
    koru.libDir = requirejs.nodeRequire('path').resolve(module.toUrl('.'), '../../..');

    koru._afTimeout = koru.afTimeout = function (func, duration) {
      var cancel = koru.setTimeout(func, duration);
      return function () {
        cancel && clearTimeout(cancel);
        cancel = null;
      };
    };

    koru.setTimeout = function (func, duration) {
      var fiber = util.Fiber(function () {
        try {
          func();
        } catch(ex) {
          koru.error(util.extractError(ex));
        }
      });
      return setTimeout(fiber.run.bind(fiber), duration);
    };

    let dbBroker;

    koru.fiberConnWrapper = function (func, conn, data) {
      dbBroker || require(['koru/model/db-broker'], value => dbBroker = value);
      util.Fiber(function () {
        try {
          var thread = util.thread;
          thread.userId = conn.userId;
          thread.connection = conn;
          dbBroker.db = conn.db;

          func(conn, data);
        } catch(ex) {
          koru.error(util.extractError(ex));
        }
      }).run();
    };

    module.ctx.onError = function (error, mod) {
      koru.error(util.extractError(error) + "\nerror loading: " + mod.id +
                 '\nwith dependancies:\n' + Object.keys(koru.fetchDependants(mod)).join('\n'));
      throw error;
    };
  };
});

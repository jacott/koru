define(function(require, exports, module) {
  const util     = require('./util-server');

  return function (koru) {
    global._koru_ = koru;

    koru.onunload(module, 'reload');

    let dbBroker;

    util.merge(koru, {
      global,
      reload() {
        if (koru.loadError) throw koru.loadError;
        console.log('=> Reloading');

        const argv = process.argv.slice(0,1).concat(process.execArgv.concat(process.argv.slice(1)));
        requirejs.nodeRequire('bindings')('koru_restart.node')
          .execv(process.execPath, argv);
      },

      Fiber: util.Fiber,

      appDir: koru.config.appDir || module.toUrl('').slice(0,-1),
      libDir: requirejs.nodeRequire('path').resolve(module.toUrl('.'), '../../..'),

      afTimeout(func, duration) {
        let cancel = koru.setTimeout(func, duration);
        return () => {
          cancel && clearTimeout(cancel);
          cancel = null;
        };
      },

      setTimeout(func, duration) {
        return setTimeout(() => koru.fiberRun(func), duration);
      },

      fiberConnWrapper(func, conn, data) {
        dbBroker || require(['koru/model/db-broker'], value => dbBroker = value);
        util.Fiber(() => {
          try {
            const thread = util.thread;
            thread.userId = conn.userId;
            thread.connection = conn;
            dbBroker.db = conn.db;

            func(conn, data);
          } catch(ex) {
            koru.error(util.extractError(ex));
          }
        }).run();
      },
    });

    /**
     * _afTimeout is used by client session; do not override in tests
     **/
    koru._afTimeout = koru.afTimeout;


    module.ctx.onError = function (error, mod) {
      koru.error(util.extractError(error) + "\nerror loading: " + mod.id +
                 '\nwith dependancies:\n' + Object.keys(koru.fetchDependants(mod)).join('\n'));
      throw error;
    };
  };
});

define(function(require, exports, module) {
  const util     = require('./util-server');

  return function (koru) {
    global['_koru'+'_'] = koru; // avoid search for de-bug statements

    koru.onunload(module, 'reload');

    let dbBroker = null;

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
        return setTimeout(() => koru.runFiber(func), duration);
      },

      runFiber(func) {
        let restart = false;
        util.Fiber(()=>{
          if (restart) return;
          restart = true;
          try {
            func();
          } catch(ex) {
            koru.unhandledException(ex);
          }
        }).run();
      },

      fiberConnWrapper(func, conn, data) {
        dbBroker !== null || require(['koru/model/db-broker'], value => dbBroker = value);
        let restart = false;
        util.Fiber(() => {
          if (restart) return;
          restart = true;
          try {
            const thread = util.thread;
            thread.userId = conn.userId;
            thread.connection = conn;
            dbBroker.db = conn.db;

            func(conn, data);
          } catch(ex) {
            koru.unhandledException(ex);
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

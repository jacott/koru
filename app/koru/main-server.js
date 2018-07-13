/*global WebSocket, KORU_APP_VERSION */

define((require, exports, module)=>{
  const util            = require('./util-server');

  const TWENTY_DAYS = 20*util.DAY;

  return koru =>{
    global['_koru'+'_'] = koru; // avoid search for de-bug statements

    koru.onunload(module, 'reload');

    let dbBroker = null;

    {
      const versionParts = (process.env.KORU_APP_VERSION || 'dev,h'+util.dateNow()).split(',');
      koru.version = versionParts[0];
      koru.versionHash = versionParts[1];
    }

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
        let cancel = 0;
        if (duration > TWENTY_DAYS) {
          const endTime = Date.now() + duration;
          const loop = ()=>{
            const now = Date.now();
            if (endTime - now > TWENTY_DAYS)
              cancel = setTimeout(loop, TWENTY_DAYS);
            else
              cancel = koru.setTimeout(func, Math.max(endTime - now, 0));
          };

          cancel = setTimeout(loop, TWENTY_DAYS);
        } else {
          cancel = koru.setTimeout(func, duration);
        }
        return () => {
          cancel != 0 && clearTimeout(cancel);
          cancel = 0;
        };
      },

      setTimeout(func, duration) {
        if (duration > 2147483640) throw new Error('duration too big');
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


    module.ctx.onError = (error, mod)=>{
      koru.error(util.extractError(error) + "\nerror loading: " + mod.id +
                 '\nwith dependancies:\n' + Object.keys(koru.fetchDependants(mod)).join('\n'));
      throw error;
    };
  };
});

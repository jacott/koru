define((require, exports, module) => {
  'use strict';
  const KoruThread      = require('koru/koru-thread');
  const util            = require('./util-server');

  const TWENTY_DAYS = 20 * util.DAY;

  return (koru) => {
    koru.onunload(module, 'reload');

    let dbBroker = null;

    {
      const versionParts = (process.env.KORU_APP_VERSION ?? 'dev,h' + util.dateNow()).split(',');
      koru.version = versionParts[0];
      koru.versionHash = versionParts[1];
    }

    util.merge(koru, {
      reload() {
        if (koru.loadError) throw koru.loadError;
        console.log('=> Reloading');

        const argv = [process.argv[0], ...process.execArgv, ...process.argv.slice(1)];
        try {
          requirejs.nodeRequire('../build/Release/koru_restart.node')
            .execv(process.execPath, argv);
        } catch (err) {
          console.log(`=> Reload not supported`);
          process.exit(1);
        }
      },

      appDir: koru.config.appDir ?? module.toUrl('').slice(0, -1),
      libDir: requirejs.nodeRequire('path').resolve(module.toUrl('.'), '../../..'),

      logger: (type, ...args) => {
        if (type === 'D') {
          console.log('D> ' + util.inspect(args));
        } else {
          const {connection, userId} = util.thread;
          console.log(type + '> ' + (connection === void 0
                                     ? ''
                                     : userId + ' on ' + connection.engine + ' ' +
                                     connection.remoteAddress + ':' + connection.sessId + ':\n') +
                      args.join(' '));
        }
      },

      afTimeout(func, duration) {
        let cancel = 0;
        if (duration > TWENTY_DAYS) {
          const endTime = Date.now() + duration;
          const loop = () => {
            const now = Date.now();
            if (endTime - now > TWENTY_DAYS) {
              cancel = setTimeout(loop, TWENTY_DAYS);
            } else {
              cancel = koru.setTimeout(func, Math.max(endTime - now, 0));
            }
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

      runFiber(func) {
        const thread = new KoruThread();
        return globalThis.__koruThreadLocal.run(thread, () => {
          let ans;
          try {
            ans = func();
          } catch (err) {
            try {
              koru.unhandledException(err);
            } catch (err) {
              console.error(err);
            }
          }
          if (isPromise(ans)) {
            return ans.catch(koru.unhandledException).finally(() => KoruThread.runFinally(thread));
          }
          KoruThread.runFinally(thread);
          return ans;
        });
      },

      fiberConnWrapper(func, conn, data) {
        dbBroker !== null || require(['koru/model/db-broker'], (value) => dbBroker = value);
        const thread = new KoruThread(conn);

        return globalThis.__koruThreadLocal.run(thread, () => {
          dbBroker.db = conn.db;
          let ans;
          try {
            ans = func(conn, data);
          } catch(err) {
            try {
              koru.unhandledException(err);
            } catch (err) {
              console.error(err);
            }
          }
          if (isPromise(ans)) {
            return ans.catch(koru.unhandledException).finally(() => KoruThread.runFinally(thread));
          }
          KoruThread.runFinally(thread);
          return ans;
        });
      },
    });

    /**
     * _afTimeout is used by client session; do not override in tests
     **/
    koru._afTimeout = koru.afTimeout;

    KoruThread.koru = koru;
  };
});

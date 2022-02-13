const fs = require('fs');
const {readdir} = require('fs/promises');
const Path = require('path');

define((require, exports, module) => {
  'use strict';
  const fst             = require('koru/fs-tools');
  const koru            = require('../main');
  const util            = require('../util');

  const topDir = koru.appDir;

  const {stat} = fst;

  const BuildCmd = {
    async runTests(session, type, pattern='', callback) {
      const cTests = type !== 'server' ? [] : null;
      const sTests = type !== 'client' ? [] : null;

      const pushPath = (path) => {
        cTests !== null && ! path.match(/\bserver\b/i) && cTests.push(path);
        sTests !== null && ! path.match(/\bclient\b|\bui\b/i) && sTests.push(path);
      };

      const findAll = async (dir, exDirs) => {
        const dirPath = Path.join(topDir, dir);
        const filenames = (await readdir(dirPath)).filter((fn) => (
          (exDirs === undefined || exDirs[fn] === undefined) &&
            (fn.endsWith('-test.js') || ! fn.endsWith('.js'))));
        const stats = filenames.map((filename) => stat(Path.join(dirPath, filename)));

        for (let i = 0; i < filenames.length; ++i) {
          try {
            if ((await stats[i]).isDirectory()) {
              await findAll(Path.join(dir, filenames[i]));
            } else if (filenames[i].endsWith('-test.js')) {
              pushPath(Path.join(dir, filenames[i].slice(0, -3)));
            }
          } catch (err) {
            if (err.code === 'ENOENT') {
              koru.error(err);
            } else {
              throw err;
            }
          }
        }
      };

      if (pattern === '') {
        if (process.env.KORUAPI) {
          // clear api files
          type === 'server' ||
            fst.rm_f(Path.resolve(koru.appDir, '../doc/api-client.json'));
          type === 'client' ||
            fst.rm_f(Path.resolve(koru.appDir, '../doc/api-server.json'));
        }
        // all
        const config = module.config();
        const exDirs = koru.util.toMap(config.excludeDirs || []);
        for (const dir of config.testDirs || ['.']) {
          await findAll(dir, exDirs);
        }
      } else {
        // one
        const idx = pattern.indexOf(' ');
        pushPath((idx === -1 ? pattern : pattern.slice(0, idx)) + '-test');
      }

      type = 'none';

      if (cTests && cTests.length) {
        type = 'client';
      }

      if (sTests && sTests.length) {
        type = type === 'none' ? 'server' : 'both';
      }

      if (type === 'none') {
        return;
      }

      if (type !== 'client') {
        const dest = module.toUrl('test/server-ready.js');
        if (module.ctx.modules['test/server-ready']) {
          await new Promise((resolve, reject)=>{
            BuildCmd.serverReady = resolve;
            fs.unlinkSync(dest);
          });
          BuildCmd.serverReady = null;
        }
        try {
          fs.symlinkSync(module.toUrl('./server-ready-prep.js'), dest);
        } catch (ex) {}
      }

      callback(type, {
        server() {
          require(['./server', 'test/server-ready'], (TH, serverReady) => {
            serverReady(koru, BuildCmd);
            TH.run(pattern, sTests);
          });
        },
        clientTests: cTests,
        client(conn, clientTests) {
          conn.sendBinary('T', [pattern, clientTests]);
        },
      });
    },
  };

  return BuildCmd;
});

const fs = require('fs');
const Path = require('path');

define((require, exports, module)=>{
  'use strict';
  const fst             = require('koru/fs-tools');
  const koru            = require('../main');
  const util            = require('../util');

  const {Future} = util, wait = Future.wait;

  const topDir = koru.appDir;
  const readdir = Future.wrap(fs.readdir);
  const stat = Future.wrap(fs.stat);

  const BuildCmd = {
    runTests(session, type, pattern='', callback) {
      const cTests = type !== 'server' ? [] : null;
      const sTests = type !== 'client' ? [] : null;

      const pushPath = (path)=>{
        cTests !== null && !path.match(/\bserver\b/i) && cTests.push(path);
        sTests !== null && !path.match(/\bclient\b|\bui\b/i) && sTests.push(path);
      };


      const findAll = (dir, exDirs) =>{
        const dirPath = Path.join(topDir, dir);
        const filenames = readdir(dirPath).wait().filter(fn => (
          (exDirs === undefined || exDirs[fn] === undefined) &&
            (fn.endsWith("-test.js") || ! fn.endsWith(".js"))));
        const stats = filenames.map(filename => stat(Path.join(dirPath, filename)));

        wait(stats);

        for(let i = 0; i < filenames.length; ++i) {
          if (stats[i].get().isDirectory()) {
            findAll(Path.join(dir, filenames[i]));
          } else if (filenames[i].endsWith("-test.js")) {
            pushPath(Path.join(dir,filenames[i].slice(0,-3)));
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
        const exDirs = koru.util.toMap(config.excludeDirs||[]);
        util.forEach(config.testDirs || ["."], dir =>{findAll(dir, exDirs)});
      } else {
        // one
        const idx = pattern.indexOf(' ');
        pushPath((idx === -1 ? pattern : pattern.slice(0, idx))+'-test');
      }

      type = 'none';

      if (cTests && cTests.length)
        type = 'client';

      if (sTests && sTests.length)
        type = type === 'none' ? 'server' : 'both';

      if (type === 'none')
        return;

      if (type !== 'client') {
        const dest = module.toUrl('test/server-ready.js');
        if (module.ctx.modules['test/server-ready']) {
          BuildCmd.serverReady = new Future;
          fs.unlinkSync(dest);
          BuildCmd.serverReady.wait();
          BuildCmd.serverReady = null;
        }
        try {
          fs.symlinkSync(module.toUrl('./server-ready-prep.js'), dest);
        } catch(ex) {}
      }

      callback(type, {
        server() {
          require(['./server', 'test/server-ready'], (TH, serverReady)=>{
            serverReady(koru, BuildCmd);
            TH.run(pattern, sTests);
          });
        },
        clientTests: cTests,
        client(conn, clientTests) {
          conn.sendBinary('T', [pattern, clientTests]);
        }
      });
    },
  };

  return BuildCmd;
});

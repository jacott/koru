const fs = require('fs');
const Path = require('path');

define(function(require, exports, module) {
  const koru   = require('../main');
  const util   = require('../util');
  const Future = requirejs.nodeRequire('fibers/future'), wait = Future.wait;

  const topDir = koru.appDir;
  const readdir = Future.wrap(fs.readdir);
  const stat = Future.wrap(fs.stat);

  return exports = {
    runTests(session, type, pattern, callback) {
      if (type !== 'server') {
        var cTests = [];
      }
      if (type !== 'client') {
        var sTests = [];
      }

      pattern = pattern || '';

      if (pattern === '') {
        // all
        var config = module.config();
        var exDirs = koru.util.toMap(config.excludeDirs||[]);
        util.forEach(config.testDirs ||
         readdir(topDir).wait().filter(function (fn) {
           return stat(fn).wait().isDirectory() &&
             (!(fn in exDirs));
         }), function (dir) {
          findAll(dir);
        });
      } else {
        // one
        var idx = pattern.indexOf(' ');
        var path = (idx === -1 ? pattern : pattern.slice(0, idx))+'-test';
        cTests && cTests.push(path);
        sTests && sTests.push(path);
      }

      type = 'none';

      if (cTests && cTests.length)
        type = 'client';

      if (sTests && sTests.length)
        type = type === 'none' ? 'server' : 'both';

      if (type === 'none')
        return;

      if (type !== 'client') {
        var dest = module.toUrl('test/server-ready.js');
        if (module.ctx.modules['test/server-ready']) {
          exports.serverReady = new Future;
          fs.unlinkSync(dest);
          exports.serverReady.wait();
          exports.serverReady = null;
        }
        try {
          fs.symlinkSync(module.toUrl('./server-ready-prep.js'), dest);
        } catch(ex) {}
      }

      callback(type, {
        server() {
          require(['./server', 'test/server-ready'], function (TH, serverReady) {
            serverReady(koru, exports);
            TH.run(pattern, sTests);
          });
        },
        clientTests: cTests,
        client(conn, clientTests) {
          conn.sendBinary('T', [pattern, clientTests]);
        }
      });

      function findAll(dir) {
        const dirPath = Path.join(topDir, dir);
        const filenames = readdir(dirPath).wait().filter(function (fn) {
          return /^[\w-]*(?:-test\.js$|$)/.test(fn);
        });
        const stats = filenames.map(function (filename) {
          return stat(Path.join(dirPath, filename));
        });

        wait(stats);

        for(let i = 0; i < filenames.length; ++i) {
          if (stats[i].get().isDirectory()) {
            findAll(Path.join(dir, filenames[i]));
          } else if (filenames[i].match(/^\w.*-test\.js$/)) {
            var path = Path.join(dir,filenames[i].slice(0,-3));
            cTests && !path.match(/\bserver\b/i) && cTests.push(path);
            sTests && !path.match(/\bclient\b/i) && sTests.push(path);
          }
        }
      }
    },
  };
});

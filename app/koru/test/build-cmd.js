var Future = requirejs.nodeRequire('fibers/future'), wait = Future.wait;
var fs = require('fs');
var Path = require('path');
var readdir = Future.wrap(fs.readdir);
var stat = Future.wrap(fs.stat);

define(function(require, exports, module) {
  var koru = require('../main');
  var topDir = koru.appDir;
  var cmdFn = Path.resolve(topDir + '/../tmp/cmd-client.js');
  var util = require('../util');

  try {fs.mkdirSync(topDir+'/.build');} catch(ex) {}

  return {
    runTests: function(session, type, pattern, callback) {
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

      callback(type);

      if (type === 'none')
        return;

      if (type !== 'server') {
        session.unload('/.build/cmd-client.js');
        fs.writeFileSync(cmdFn,
                         "define(['koru/test/client'],function(TH){TH.run("+
                         JSON.stringify(pattern)+","+JSON.stringify(cTests)+
                         ")})");
        fs.renameSync(cmdFn, topDir + '/.build/cmd-client.js');
        session.load('/.build/cmd-client.js');
      }

      if (type !== 'client') {
        require(['./server'], function (TH) {TH.run(pattern, sTests)});
      }

      function findAll(dir) {
        var dirPath = Path.join(topDir, dir);
        var filenames = readdir(dirPath).wait().filter(function (fn) {
          return /^[\w-]*(?:-test\.js$|$)/.test(fn);
        });
        var stats = filenames.map(function (filename) {
          return stat(Path.join(dirPath, filename));
        });

        wait(stats);

        for(var i = 0; i < filenames.length; ++i) {
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

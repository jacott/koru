var Future = require('fibers/future'), wait = Future.wait;
var fs = require('fs');
var Path = require('path');
var readdir = Future.wrap(fs.readdir);
var stat = Future.wrap(fs.stat);

define(function() {
  var topDir = requirejs.toUrl('').slice(0,-1);

  return {
    runTests: function(session, type, pattern, callback) {

      if (type !== 'server') {
        session.unload('client-cmd');
        var cTests = ['bart-test/client'];
      }
      if (type !== 'client') {
        session.unload('server-cmd');
        var sTests = ['bart-test/server'];
      }

      if (pattern === '') {
        // all
        findAll('');
      } else {
        // one
        var idx = pattern.indexOf(' ');
        var path = (idx === -1 ? pattern : pattern.slice(0, idx))+'-test';
        cTests && cTests.push(path);
        sTests && sTests.push(path);
      }

      type = 'none';

      if (cTests && cTests.length > 1)
        type = 'client';

      if (sTests && sTests.length > 1)
        type = type === 'none' ? 'server' : 'both';

      callback(type);

      if (type === 'none')
        return;

      if (type !== 'server') {
        var cmdFn = requirejs.toUrl('../tmp/client-cmd.js');
        fs.writeFileSync(cmdFn,
                         "define(" + JSON.stringify(cTests) + ",function(bt){bt.run("+
                         JSON.stringify(pattern)+
                         ")})");
        fs.renameSync(cmdFn, requirejs.toUrl('client-cmd.js'));
        session.load('client-cmd');
      }

      if (type !== 'client') {
        requirejs(sTests, function (bt) {
          bt.run(pattern);
        });
      }

      function findAll(dir) {
        var dirPath = Path.join(topDir, dir);
        var filenames = readdir(dirPath).wait();
        var stats = filenames.map(function (filename) {
          return stat(Path.join(dirPath, filename));
        });

        wait(stats);

        for(var i = 0; i < filenames.length; ++i) {
          if (stats[i].get().isDirectory()) {
            findAll(Path.join(dir, filenames[i]));
          } else if (filenames[i].match(/^\w.*-test\.js$/)) {
            var path = Path.join(dir,filenames[i].slice(0,-3));
            cTests && !path.match(/\bserver-test$/i) && cTests.push(path);
            sTests && !path.match(/\bclient-test$/i) && sTests.push(path);
          }
        }
      }
    },

  };

});

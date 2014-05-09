var Future = require('fibers/future'), wait = Future.wait;
var fs = require('fs');
var Path = require('path');
var readdir = Future.wrap(fs.readdir);
var stat = Future.wrap(fs.stat);

define(function() {
  var topDir = requirejs.toUrl('').slice(0,-1);

  console.log('DEBUG topDir',topDir);


  return function (pattern) {

    var reqs = ['bart-test'];

    if (pattern === '') {
      // all
      findAll('', reqs);
    } else {
      // one
      var idx = pattern.indexOf(' ');
      reqs.push((idx === -1 ? pattern : pattern.slice(0, idx))+'-test');
    }
    var cmdFn = requirejs.toUrl('../tmp/client-cmd.js');
    fs.writeFileSync(cmdFn,
                     "define(" + JSON.stringify(reqs) + ",function(bt){bt.run("+
                     JSON.stringify(pattern)+
                     ")})");
    fs.renameSync(cmdFn, requirejs.toUrl('client-cmd.js'));
  };

  function findAll(dir, results) {
    var dirPath = Path.join(topDir, dir);
    var filenames = readdir(dirPath).wait();
    var stats = filenames.map(function (filename) {
      return stat(Path.join(dirPath, filename));
    });

    wait(stats);

    for(var i = 0; i < filenames.length; ++i) {
      if (stats[i].get().isDirectory()) {
        findAll(Path.join(dir, filenames[i]), results);
      } else if (filenames[i].match(/^\w.*-test\.js$/)) {
        results.push(Path.join(dir,filenames[i].slice(0,-3)));
      }
    }
  }
});

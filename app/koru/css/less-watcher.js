var Future = requirejs.nodeRequire('fibers/future'), wait = Future.wait;
var fs = require('fs');
var Path = require('path');
var readdir = Future.wrap(fs.readdir);
var stat = Future.wrap(fs.stat);

define(function(require, exports, module) {
  var koru = require('../main');
  var fw = require('../file-watch');
  var fst = require('../fs-tools');
  var session = require('../session/base');
  var topDir = koru.appDir;
  var topDirLen = koru.appDir.length + 1;
  var queue = require('../queue')();
  var util = require('koru/util');

  var loads = {};
  var imports = {};
  var sources = {};
  var loadDirs = {};

  koru.onunload(module, 'reload');

  fw.listeners['less'] = watchLess;
  fw.listeners['lessimport'] = watchLess;

  session.provide('S', loadRequest);

  function loadRequest(data) {
    if (data.slice(0,2).toString() === 'LA')
      this.send('SL', findAll(data.slice(2).toString()).join(' '));
  }

  function findAll(dir) {
    if (dir.match(/(^[./]|[./]\.)/)) throw new koru.Error(500, 'Illegal directory name');


    loadDirs.hasOwnProperty(dir) || queue(dir, function (isNew, result) {
      loadDirs[dir] = true;
      var prefixLen = dir.length + 1;
      findAll1(dir);

      function findAll1(dir) {
        var m;
        var dirPath = Path.join(topDir, dir);
        var filenames = readdir(dirPath).wait().filter(function (fn) {
          return /^[\w-]*(?:\.(css|less)$|$)/.test(fn);
        });
        var stats = filenames.map(function (filename) {
          return stat(Path.join(dirPath, filename));
        });

        wait(stats);

        for(var i = 0; i < filenames.length; ++i) {
          var fn = Path.join(dir, filenames[i]);
          if (fn in loads) continue;

          if (m = filenames[i].match(/^\w.*(less|css)$/)) {
            if (m[1] === 'less')
              extractInfo(fn);
            else
              loads[fn] = true;
          } else if (stats[i].get().isDirectory()) {
            findAll1(fn);
          }
        }
      }
    });

    var re = new RegExp("^"+util.regexEscape(dir));

    var results = [];

    for(var key in loads) {
      re.test(key) && results.push(key);
    }

    return results;
  }

  function extractInfo(srcName, fromName) {
    if (srcName[0] !== '.') {
      var fullname = Path.join(topDir, srcName);
      try {
        var src = fst.readFile(fullname);
      } catch(ex) {
      }
    }
    if (! src) {
      fullname = Path.resolve(topDir, Path.dirname(fromName), srcName);
      try {
        src = fst.readFile(fullname);
        srcName = fullname.slice(topDirLen);
      } catch(ex) {
        if (ex.code === 'ENOENT') {
          ex.message = "ENOENT @import '" + srcName + "' from '" + fromName + '"';
          throw ex;
        }
      }
    }

    var fullname = Path.join(topDir, srcName);
    var src = fst.readFile(fullname);

    var provs = sources[srcName];
    if (! src) {

      if (provs) for(imp in provs) {
        imp = imports[imp];
        if (imp) delete imp[srcName];
      }

      delete sources[srcName];

      fromName || delete loads[srcName];

      return;
    };

    if (fromName) {
      var st = fst.stat(fullname);
    } else {
      var st = fst.stat(buildName(fullname));
      loads[srcName] = true;
    }

    st = st && +st.mtime;

    src = src.toString();

    var dir = Path.dirname(fullname);

    var re = /(?:^|\n)\s*@import[\s]*"([^"]*\.lessimport)"/g;

    var m;

    if (! provs) provs = sources[srcName] = {};
    provs.mtime = st;

    while (m = re.exec(src)) {
      var imp = Path.resolve(Path.join(dir, m[1])).slice(topDirLen);
      var deps = imports[imp];
      if (! deps)  {
        imports[imp] = deps = {};
        var imt = extractInfo(imp, srcName);

      } else {
        var imt = sources[imp].mtime;
      }

      if (st && imt && imt > st) {
        st = imt;
      }

      provs[imp] = true;
      deps[srcName] = true;
    }

    if (st && provs.mtime && st > provs.mtime ) {
      if (fromName) {
        provs.mtime = st; // propagate most recent time
      } else
        fst.rm_f(buildName(fullname));
    }


    return st;
  }

  function buildName(fullname) {
    return Path.join(Path.dirname(fullname),
                     ".build", Path.basename(fullname)+".css");
  }

  function watchLess(type, path, top, session) {
    var prefix = Path.dirname(path);
    while(prefix.length > 1 && ! loadDirs.hasOwnProperty(prefix)) {
      prefix = Path.dirname(prefix);
    }

    if (! loadDirs.hasOwnProperty(prefix)) return;

    queue(path, function (queue) {
      extractInfo(path, type === 'less' ? null : path);
      if (queue.isPending) return;
      if (type === 'less')
        session.sendAll('SL', path);
      else {
        var list = [];

        var count = 0;

        findDeps(path);
        function findDeps(name) {
          var deps = imports[name];

          if (deps) for(var key in deps) {
            if (/\.lessimport$/.test(key))
              ++count < 20 && findDeps(key);
            else {
              list.push(key);
              fst.rm_f(buildName(Path.join(topDir, key)));
            }
          }
        }
        if (queue.isPending || list.length === 0)
          return;
        session.sendAll('SL', list.join(' '));
      }
    });
  }

  return {
    get loads() {return loads},
    get imports() {return imports},
    get sources() {return sources},
    get loadDirs() {return loadDirs},
    clearGraph: function () {
      loads = {};
      imports = {};
      sources = {};
      loadDirs = {};
    },
  };
});

var fs = require('fs');
var Path = require('path');
var Fiber = requirejs.nodeRequire('fibers');
var Future = requirejs.nodeRequire('fibers/future'), wait = Future.wait;

var readdir_w = Future.wrap(fs.readdir);
var stat_w = Future.wrap(fs.stat);
var unlink_w = Future.wrap(fs.unlink);
var utimes_w = Future.wrap(fs.utimes);

define({
  mkdir: mkdir,
  mkdir_p: mkdir_p,
  appendData: appendData,
  readdir: readdir,
  readFile: readFile,
  rename: rename,
  rmdir: rmdir,
  stat: stat,
  truncate: truncate,
  unlink: unlink,
  writeFile: writeFile,
  setMtime: function (path, time) {
    time = new Date(time);
    utimes_w(path, time, time).wait();
  },

  rm_r: function (dir) {
    stat(dir) && rm_rf_w(dir).wait();
  },

  rm_f: function (file) {
    try {
      unlink(file);
      return true;
    } catch(ex) {
      if (ex.code !== 'ENOENT')
        throw ex;
      return false;
    }
  },
});

function stat(path) {
  try {
    return futureWrap(fs, fs.stat, [path]);
  } catch (ex) {
    if (ex.code === 'ENOENT')
      return;

    throw ex;
  }
}

var rm_rf_w = Future.wrap(function (dir, callback) {
  Fiber(function () {
    try {
      var filenames = readdir_w(dir).wait();

      var stats = filenames.map(function (filename) {
        return stat_w(Path.join(dir, filename));
      });

      wait(stats);

      for(var i = 0; i < filenames.length; ++i) {
        var fn = Path.join(dir, filenames[i]);

        filenames[i] =
          stats[i].get().isDirectory() ?
          rm_rf_w(fn) : unlink_w(fn);
      }

      wait(filenames);

      fs.rmdir(dir, callback);
    } catch(ex) {
      callback(ex);
      return;
    }
  }).run();
});


function appendData(path, data) {
  var fd = futureWrap(fs, fs.open, [path, 'a', {mode: 0644}]);
  try {
    return futureWrap(fs, fs.write, [fd, data, 0, data.length, null]);
  } finally {
    futureWrap(fs, fs.close, [fd]);
  }
}

function rename(from, to) {
  return futureWrap(fs, fs.rename, [from, to]);
}

function truncate(path, len) {
  return futureWrap(fs, fs.truncate, [path, len || 0]);
}

function unlink(path) {
  return futureWrap(fs, fs.unlink, [path]);
}

function rmdir(path) {
  return futureWrap(fs, fs.rmdir, [path]);
}

function readdir(path) {
  return futureWrap(fs, fs.readdir, [path]);
}

function readFile(path, options) {
  return futureWrap(fs, fs.readFile, [path, options]);
}

function writeFile(path, options) {
  return futureWrap(fs, fs.writeFile, [path, options]);
}

function mkdir(dir) {
  try {
    return futureWrap(fs, fs.mkdir, [dir, 0755]);
  } catch (ex) {
    if (ex.code === 'EEXIST')
      return;

    throw ex;
  }
}

function mkdir_p(path) {
  path = Path.resolve(path);
  var idx = 0;
  while((idx = path.indexOf('/', idx+1)) !== -1) {
    var tpath = path.slice(0, idx);
    var st = stat(path);
    if (st && ! st.isDirectory()) {
      var error = new Error('Not a direcorty');
      error.code = 'ENOTDIR';
      throw error;
    }
    if (! st) mkdir(tpath);
  }
  mkdir(path);
}

function futureWrap(obj, func, args) {
  var future = new Future;
  var results;

  var callback = function (error, data) {
    if (error) {
      future.throw(error);
      return;
    }
    results = data;
    future.return();
  };
  args.push(callback);
  func.apply(obj, args);
  future.wait();
  return results;
}

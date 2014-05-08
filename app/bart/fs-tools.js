var fs = require('fs');
var Path = require('path');
var Future = require('fibers/future');
define({
  mkdir: mkdir,
  mkdirp: mkdirp,
  readdir: readdir,
  rename: rename,
  rmdir: rmdir,
  stat: stat,
  truncate: truncate,
  unlink: unlink,
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

function mkdir(dir) {
  try {
    return futureWrap(fs, fs.mkdir, [dir, 0755]);
  } catch (ex) {
    if (ex.code === 'EEXIST')
      return;

    throw ex;
  }
}

function mkdirp(path) {
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

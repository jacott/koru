const fs = require('fs');
const Path = require('path');
const Fiber = requirejs.nodeRequire('fibers');
const Future = requirejs.nodeRequire('fibers/future'), wait = Future.wait;

const readdir_w = Future.wrap(fs.readdir);
const stat_w = Future.wrap(fs.stat);
const unlink_w = Future.wrap(fs.unlink);
const utimes_w = Future.wrap(fs.utimes);

function waitMethod(method, ...args) {
  try {
    return futureWrap(fs, method, args);
  } catch (ex) {
    if (ex.code === 'ENOENT')
      return;

    throw ex;
  }
}

function stat(path) {
  return waitMethod(fs.stat, path);
}

function lstat(path) {
  return waitMethod(fs.lstat, path);
}

const rm_rf_w = Future.wrap((dir, callback) => {
  let restart = false;
  Fiber(()=>{
    if (restart) return;
    restart = true;
    try {
      const filenames = readdir_w(dir).wait();

      const stats = filenames.map(filename => stat_w(Path.join(dir, filename)));

      wait(stats);

      for(let i = 0; i < filenames.length; ++i) {
        const fn = Path.join(dir, filenames[i]);

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

function link(from, to) {
  return futureWrap(fs, fs.link, [from, to]);
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

const futureWrap = (obj, func, args)=>{
  const future = new Future;

  const callback = (error, data)=>{
    if (error) {
      future.throw(error);
      return;
    }
    future.return(data);
  };
  args.push(callback);
  func.apply(obj, args);
  return future.wait();
};

define({
  mkdir,
  mkdir_p,
  appendData,
  readdir,
  readFile,
  rename,
  rmdir,
  stat,
  lstat,
  readlink(path) {
    return waitMethod(fs.readlink, path);
  },
  truncate,
  unlink,
  link,
  writeFile,
  setMtime(path, time) {
    time = new Date(time);
    utimes_w(path, time, time).wait();
  },

  rm_r(dir) {
    stat(dir) && rm_rf_w(dir).wait();
  },

  rm_f(file) {
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

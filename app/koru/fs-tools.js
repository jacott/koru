const fs = require('fs');
const Path = require('path');
const Fiber = requirejs.nodeRequire('fibers');
const Future = requirejs.nodeRequire('fibers/future'), wait = Future.wait;

const readdir_w = Future.wrap(fs.readdir);
const stat_w = Future.wrap(fs.stat);
const unlink_w = Future.wrap(fs.unlink);
const utimes_w = Future.wrap(fs.utimes);

const waitMethod = (method, ...args)=>{
  try {
    return futureWrap(fs, method, args);
  } catch (ex) {
    if (ex.code === 'ENOENT')
      return;

    throw ex;
  }
};

const stat = path => waitMethod(fs.stat, path);
const lstat = path => waitMethod(fs.lstat, path);

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


const appendData = (path, data)=>{
  const fd = futureWrap(fs, fs.open, [path, 'a', {mode: 0644}]);
  try {
    return futureWrap(fs, fs.write, [fd, data, 0, data.length, null]);
  } finally {
    futureWrap(fs, fs.close, [fd]);
  }
};

const rename = (from, to)=> futureWrap(fs, fs.rename, [from, to]);

const truncate = (path, len)=> futureWrap(fs, fs.truncate, [path, len || 0]);

const unlink = (path)=> futureWrap(fs, fs.unlink, [path]);

const link = (from, to)=> futureWrap(fs, fs.link, [from, to]);

const rmdir = (path)=> futureWrap(fs, fs.rmdir, [path]);

const readdir = (path)=> futureWrap(fs, fs.readdir, [path]);

const readFile = (path, options)=> futureWrap(fs, fs.readFile, [path, options]);

const writeFile = (path, options)=> futureWrap(fs, fs.writeFile, [path, options]);

const mkdir = (dir)=>{
  try {
    return futureWrap(fs, fs.mkdir, [dir, 0755]);
  } catch (ex) {
    if (ex.code === 'EEXIST')
      return;

    throw ex;
  }
};

const mkdir_p = (path)=>{
  path = Path.resolve(path);
  let idx = 0;
  while((idx = path.indexOf('/', idx+1)) !== -1) {
    const tpath = path.slice(0, idx);
    const st = stat(path);
    if (st && ! st.isDirectory()) {
      const error = new Error('Not a direcorty');
      error.code = 'ENOTDIR';
      throw error;
    }
    if (! st) mkdir(tpath);
  }
  mkdir(path);
};

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

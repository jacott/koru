const fs = require('fs/promises');

define(() => {
  'use strict';

  const waitMethod = async (method, ...args) => {
    try {
      return await method(...args);
    } catch (ex) {
      if (ex.code === 'ENOENT') {
        return;
      }

      throw ex;
    }
  };

  const MKDIR_P = {mode: 0o755, recursive: true};
  const RM_F = {force: true};
  const RM_RF = {force: true, recursive: true};

  return {
    // mkdir,
    // mkdir_p,
    // appendData,
    readFile: fs.readFile,
    readdir: fs.readdir,
    // rename,
    // rmdir,
    stat: (path) => waitMethod(fs.stat, path),
    lstat: (path) => waitMethod(fs.lstat, path),
    mkdir_p: (dir) => fs.mkdir(dir, MKDIR_P),
    // realpath: (path) => futureWrap(fs, fs.realpath, [path]),
    // readlink(path) {
    //   return waitMethod(fs.readlink, path);
    // },
    // truncate,
    // unlink,
    // link,
    writeFile: fs.writeFile,
    setMtime: (path, time) => {
      time = new Date(time);
      return fs.utimes(path, time, time);
    },
    rm: fs.rm,
    rm_f: (path) => fs.rm(path, RM_F),
    rm_rf: (path) => fs.rm(path, RM_RF),
  };
});

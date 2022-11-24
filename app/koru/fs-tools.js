const fsp = require('fs/promises');
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
    appendData: async (path, data) => {
      const fh = await fsp.open(path, 'a', 0o644);
      try {
        return await fh.write(data);
      } finally {
        await fh.close();
      }
    },
    mkdir: fsp.mkdir,
    readFile: fsp.readFile,
    readdir: fsp.readdir,
    stat: (path) => waitMethod(fsp.stat, path),
    lstat: (path) => waitMethod(fsp.lstat, path),
    mkdir_p: (dir) => fsp.mkdir(dir, MKDIR_P),
    realpath: fsp.realpath,
    readlink: fsp.readlink,
    readlinkIfExists: async (path, options) => {
      try {
        return await fsp.readlink(path, options);
      } catch (err) {
        if (err.code === 'ENOENT') return void 0;
        const err2 = new Error(err.message, {cause: err});
        err2.code = err.code;
        throw err2;
      }
    },
    writeFile: fsp.writeFile,
    setMtime: (path, time) => {
      time = new Date(time);
      return fsp.utimes(path, time, time);
    },
    rm: fsp.rm,
    rm_f: (path) => fsp.rm(path, RM_F),
    rm_rf: (path) => fsp.rm(path, RM_RF),
  };
});

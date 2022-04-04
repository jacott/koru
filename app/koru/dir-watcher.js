const fs = require('fs');
const fsp = require('fs/promises');
const Path = require('path');

define((require, exports, module) => {
  'use strict';
  const util            = require('koru/util');
  const fst             = require('./fs-tools');
  const koru            = require('./main');

  const stopIfDir = (dirs, filename) => {
    const watcher = dirs[filename];
    if (watcher !== void 0) {
      delete dirs[filename];
      watcher.stop();
    }
  };

  class DirWatcher {
    constructor(dir, callback, callOnInit=false) {
      this.callback = callback;
      this.dirs = util.createDictionary();

      this.watcher = fs.watch(dir, (event, filename) => {
        this.#manage(dir, filename, true).catch(koru.unhandledException);
      });

      (async () => {
        for (const filename of await fsp.readdir(dir)) {
          this.#manage(dir, filename, callOnInit).catch(koru.unhandledException);
        }
      })().catch(koru.unhandledException);
    }

    async #manage(dir, filename, runCallback) {
      if (filename.match(/\..?$/)) return;
      const path = dir + '/' + filename;
      const {dirs} = this;
      const st = await fst.stat(path);
      if (dirs === void 0) return;
      if (st !== void 0) {
        if (st.isDirectory()) {
          dirs[filename] ??= new DirWatcher(path, this.callback, runCallback);
        } else {
          stopIfDir(dirs, filename);
        }
      } else {
        stopIfDir(dirs, filename);
      }
      if (runCallback) {
        this.callback(path, st);
      }
      return path;
    };

    stop() {
      const {dirs, watcher} = this;
      if (dirs === void 0) return;
      this.dirs = this.watcher = void 0;
      watcher.close();
      for (const n in dirs) dirs[n].stop();
    }
  }

  return DirWatcher;
});

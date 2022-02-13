const fs = require('fs');
const fsp = require('fs/promises');
const Path = require('path');

define((require, exports, module) => {
  'use strict';
  const fst             = require('./fs-tools');
  const koru            = require('./main');
  const session         = require('./session/base');

  const {runFiber, appDir: top} = koru;

  const listeners = {
    js: (type, path, top) => {
      if (path.slice(-8) !== '.html.js') {
        session.unload(path.slice(0, -3));
      }
    },

    html: (type, path) => {
      session.unload(koru.buildPath(path));
    },
  };

  const defaultUnloader = (path) => {session.unload(path)};

  const watch = async (dir, top) => {
    const dirs = Object.create(null);

    const watcher = fs.watch(dir, (event, filename) => {
      runFiber(async () => {
        if (! /^\w/.test(filename)) return;
        let path = await manage(dirs, dir, filename, top);
        if (path === void 0) return;

        const m = /\.(.+)$/.exec(path);
        const handler = m && listeners[m[1]];

        path = path.slice(top.length);

        handler != null
          ? Promise.resolve(handler(m[1], path, top, session)).catch((err) => {
            koru.unhandledException(err);
          })
          : defaultUnloader(path);
      });
    });

    for (const filename of await fsp.readdir(dir)) {
      if (filename.match(/^\w/)) {
        await manage(dirs, dir, filename, top);
      }
    }

    return watcher;
  };

  const manage = async (dirs, dir, filename, top) => {
    const path = dir + '/' + filename;
    const st = await fst.stat(path);
    if (st !== void 0) {
      if (st.isDirectory()) {
        if (dirs[filename] === void 0) dirs[filename] = await watch(path, top);
        return;
      }
    } else {
      const watcher = dirs[filename];
      if (watcher) {
        delete dirs[filename];
        watcher.close();
      }
    }
    return path;
  };

  koru.onunload(module, 'reload');

  runFiber(async () => {await watch(top, top + '/')});

  return {
    listeners,

    watch: async (dir, top) => await watch(Path.resolve(dir), Path.resolve(top) + '/'),
  };
});

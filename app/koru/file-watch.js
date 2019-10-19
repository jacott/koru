const fs = require('fs');
const Future = requirejs.nodeRequire('fibers/future');
const Path = require('path');

define((require, exports, module)=>{
  'use strict';
  const fst             = require('./fs-tools');
  const koru            = require('./main');
  const session         = require('./session/base');

  const {runFiber, appDir: top} = koru;

  const listeners = {
    js: (type, path, top)=>{
      if (path.slice(-8) !== '.html.js')
        session.unload(path.slice(0, - 3));
    },

    html: (type, path)=>{
      session.unload(koru.buildPath(path));
    },
  };

  const defaultUnloader = (path)=>{session.unload(path)};

  const watch = (dir, top)=>{
    const dirs = Object.create(null);

    const watcher = fs.watch(dir, (event, filename)=>{
      runFiber(() => {
        if (! /^\w/.test(filename)) return;
        let path = manage(dirs, dir, filename, top);
        if (path === void 0) return;

        const m = /\.(.+)$/.exec(path);
        const handler = m && listeners[m[1]];

        path = path.slice(top.length);

        handler ? handler(m[1], path, top, session) :
          defaultUnloader(path);
      });
    });
    fst.readdir(dir).forEach(filename => {
      if (! filename.match(/^\w/)) return;
      manage(dirs, dir, filename, top);
    });

    return watcher;
  };

  const manage = (dirs, dir, filename, top)=>{
    const path = dir+'/'+filename;
    const st = fst.stat(path);
    if (st !== void 0) {
      if (st.isDirectory()) {
        if (dirs[filename] === void 0) dirs[filename] = watch(path, top);
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

  runFiber(()=>{watch(top, top+'/')});

  return {
    listeners,

    watch: (dir, top)=>{watch(Path.resolve(dir), Path.resolve(top)+'/')},
  };
});

const fs = require('fs');
const Future = requirejs.nodeRequire('fibers/future');
const Path = require('path');

define(function(require, exports, module) {
  const fst     = require('./fs-tools');
  const koru    = require('./main');
  const session = require('./session/base');

  const {Fiber, appDir: top} = koru;

  koru.onunload(module, 'reload');

  exports.listeners = {
    js(type, path, top) {
      if (path.slice(-8) !== '.html.js')
        session.unload(path.slice(0, - 3));
    },

    html(type, path) {
      session.unload(koru.buildPath(path));
    },
  };

  function defaultUnloader(path) {
    session.unload(path);
  }

  exports.watch = function (dir, top) {
    watch(Path.resolve(dir), Path.resolve(top)+'/');
  };

  Fiber(function () {
    watch(top, top+'/');
  }).run();

  function watch(dir, top) {
    const dirs = Object.create(null);

    const watcher = fs.watch(dir, function (event, filename) {
      Fiber(() => {
        if (! filename.match(/^\w/)) return;
        let path = manage(dirs, dir, filename, top);
        if (! path) return;

        const m = /\.(\w+)$/.exec(path);
        const handler = m && exports.listeners[m[1]];

        path = path.slice(top.length);

        handler ? handler(m[1], path, top, session) :
          defaultUnloader(path);
      }).run();
    });
    fst.readdir(dir).forEach(filename => {
      if (! filename.match(/^\w/)) return;
      manage(dirs, dir, filename, top);
    });

    return watcher;
  }

  function manage(dirs, dir, filename, top) {
    const path = dir+'/'+filename;
    const st = fst.stat(path);
    if (st) {
      if (st.isDirectory()) {
        dirs[filename] = watch(path, top);
        return;
      }
    } else {
      const watcher = dir[filename];
      if (watcher) {
        delete dir[filename];
        watcher.close();
      }
    }
    return path;
  }
});

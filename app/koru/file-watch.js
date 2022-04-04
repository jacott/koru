const Path = require('path');

define((require, exports, module) => {
  'use strict';
  const DirWatcher      = require('koru/dir-watcher');
  const koru            = require('./main');
  const session         = require('./session/base');

  const {runFiber, appDir: top} = koru;

  const listeners = {
    __proto__: null,
    js: (type, path, top, session) => {
      if (path.slice(-8) !== '.html.js') {
        session.unload(path.slice(0, -3));
      }
    },

    html: (type, path, top, session) => {
      session.unload(koru.buildPath(path));
    },
  };

  const defaultUnloader = (path) => {session.unload(path)};

  const watch = (dir, top) => {
    const watcher = new DirWatcher(dir, (path, st) => {
      if (st?.isDirectory()) return;
      const ext = Path.extname(path).slice(1);
      const handler = listeners[ext];

      path = path.slice(top.length);

      if (handler === void 0) {
        defaultUnloader(path);
      } else {
        return handler(ext, path, top, session);
      }
    });
  };

  koru.onunload(module, 'reload');

  watch(top, top + '/');

  return {
    listeners,

    watch: (dir, top) => watch(Path.resolve(dir), Path.resolve(top) + '/'),
  };
});

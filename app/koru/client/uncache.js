define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');

  let unload;

  return {
    start: (assets={
      '.build/index.html': '/',
      'manifest.json': '/manifest.json',
      'index.css': '/index.css',
    })=>{
      if (unload !== void 0)
        return;

      unload = koru.unload;

      const location = koru.getLocation();

      const uncache = async (asset)=>{
        for (const name of await window.caches.keys()) {
          if (await (await window.caches.open(name)).delete(asset)) {
            return true;
          }
        }
        return false;
      };

      const uncacheAnReload = async (asset)=>{
        await uncache(asset);
        koru.reload();
        return;
      };

      koru.unload = async id =>{
        const asset = assets[id];
        if (asset !== void 0) {
          await uncacheAnReload(asset);
        } else if (id === 'service-worker' || id === 'sw') {
          await koru.unregisterServiceWorker();
        }
        unload(id);
      };

    },

    stop: ()=>{
      if (unload === void 0)
        return;

      koru.unload = unload;
      unload = void 0;
    }
  }
});

/**
 * Load client or server related file.
 */
(()=>{
  const suffix = (typeof global !== 'undefined') &&  this === global ? '-server' : '-client';
  define({
    /**
     * Load a module for the current koru -- client or server -- and
     * call {@unload} when ready.
     *
     * This function is used by requirejs to load a dependency of the
     * format: `koru/env!name` as `name-client.js`
     */
    load: (name, req, onload, config)=>{
      const provider = name.endsWith('-test') ? name.slice(0,-5) + suffix + "-test" : name + suffix;
      const pMod = req.module.dependOn(provider);
      if (pMod === undefined || pMod.isUnloaded()) {
        onload.error("Can't load "+provider);
      } else {
        req.module.body = () => pMod.exports;
        onload();
      }
    },

    pluginBuilder: './env-builder',
  });
})();

/**
 * Load client or server related file.
 */
(function () {
  const suffix = (typeof global !== 'undefined') &&  this === global ? '-server' : '-client';
  define({
    /**
     * Load a module for the current koru -- client or server -- and
     * call {@unload} when ready.
     *
     * This function is used by requirejs to load a dependency of the
     * format: `koru/env!name` as `name-client.js`
     */
    load(name, req, onload, config) {
      const provider = name + suffix;
      const pMod = req.module.dependOn(provider);
      req.module.body = () => pMod.exports;
      onload();
    },

    pluginBuilder: './env-builder',
  });
})();

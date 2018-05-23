/**
 * Load polyfill if needed.

 * A polyfill is needed if `requirejs['polyfill_'+name]` is defined
 */
(()=>{
  define({
    /**
     * Load a module for the current koru -- client or server -- and
     * call {@unload} when ready.
     *
     * This function is used by requirejs to load a dependency of the
     * format: `koru/env!name` as `name-client.js`
     */
    load(name, req, onload, config) {
      const provider = requirejs['polyfill_'+name];
      if (provider !== undefined) {
        const pMod = req.module.dependOn(provider);
        req.module.body = () => pMod.exports;
      }
      onload();
    },
  });
})();

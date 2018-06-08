define({
  /**
   * Load polyfill if needed.

   * A polyfill is needed if `requirejs['polyfill_'+name]` is defined
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

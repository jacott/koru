/**
 * Load file based on config setting.
 */
define((require, exports, module)=>{
  'use strict';
  return {
    /**
     * Load a module cooresponding to the config setting of name.
     *
     * This function is used by requirejs to load a dependency of the
     * format: `koru/config!name` as `nameValue.js`
     */
    load(name, req, onload, config) {
      const provider = module.config()[name];
      if (provider === undefined) {
        onload();
        return;
      }

      req.module.dependOn(provider);
      const pMod = req.module.dependOn(provider);
      req.module.body = ()=> pMod.exports;
      onload();
    },

    pluginBuilder: './config-builder',
  };
});

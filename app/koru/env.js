/**
 * Load client or server related file.
 */
define(['require', 'module'], function (require, module) {
  var koru, suffix = (typeof isServer !== 'undefined') && isServer ? '-server' : '-client';
  var loaderPrefix = module.id + "!";

  return {
    /**
     * Load a module for the current koru -- client or server -- and
     * call {@unload} when ready.
     *
     * This function is used by requirejs to load a dependency of the
     * format: koru/env!<name> as <name>-client.js
     */
    load: function (name, req, onload, config) {
      if (! koru) {
        require('./main'+suffix, function (k) {
          koru = k;
          fetch();
        });

      } else
        fetch();

      function fetch() {
        var provider = name + suffix;
        var pMod = req.module.dependOn(provider);
        req(provider, onload, onload.error);
      }
    },

    pluginBuilder: './env-builder',
  };
});

/**
 * Load client or server related file.
 */
(function () {
  var suffix = (typeof global !== 'undefined') &&  this === global ? '-server' : '-client';
  define({
    /**
     * Load a module for the current koru -- client or server -- and
     * call {@unload} when ready.
     *
     * This function is used by requirejs to load a dependency of the
     * format: koru/env!<name> as <name>-client.js
     */
    load: function (name, req, onload, config) {
      var provider = name + suffix;
      var pMod = req.module.dependOn(provider);
      req.module.body = function () {
        return pMod.exports;
      };
      onload();
    },

    pluginBuilder: './env-builder',
  });
})();

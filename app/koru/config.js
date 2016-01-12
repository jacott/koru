/**
 * Load file based on config setting.
 */
define(function(require, exports, module) {
  var loaderPrefix = module.id + "!";

  return {
    /**
     * Load a module cooresponding to the config setting of name.
     *
     * This function is used by requirejs to load a dependency of the
     * format: koru/config!<name> as <nameValue>.js
     */
    load: function (name, req, onload, config) {
      var provider = module.config()[name];
      if (! provider)
        throw new Error('No config setting: ' + name + " for " + module.id);

      req.module.dependOn(provider);
      req(provider, onload, onload.error);
    },

    pluginBuilder: './config-builder',
  };
});

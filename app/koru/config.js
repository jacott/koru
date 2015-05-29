/**
 * Load file based on config setting.
 */
define(['require', 'module'], function (require, module) {
  var koru;
  var loaderPrefix = module.id + "!";

  return {
    /**
     * Load a module cooresponding to the config setting of name.
     *
     * This function is used by requirejs to load a dependency of the
     * format: koru/config!<name> as <nameValue>.js
     */
    load: function (name, req, onload, config) {
      if (! koru) {
        require(['./main'], function (k) {
          koru = k;
          fetch();
        });
      } else
        fetch();

      function fetch() {
        var opt = name.substring(1);
        var provider = module.config()[opt];
        if (! provider) throw new Error('No config setting: ' + opt);

        koru.insertDependency(loaderPrefix + name, provider);

        req([provider], function (value) {
          onload(value);
        }, onload.error);
      }
    },

    normalize: function (name, normalize) {
      if (name[0] === ':') return name;
      return ':'+normalize(name);
    },

    pluginBuilder: './config-builder',
  };
});

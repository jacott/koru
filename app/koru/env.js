/**
 * Dependency tracking and load/unload manager.
 * This module is also a requirejs loader plugin.
 */
define(['require', 'module'], function (require, module) {
  var koru, suffix = (typeof isServer !== 'undefined') && isServer ? '-server' : '-client';
;
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
        require(['./main'], function (k) {
          koru = k;
          fetch();
        });
      } else
        fetch();

      function fetch() {
        var provider = name.substring(1) + suffix;

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

    pluginBuilder: './env-builder',
  };
});

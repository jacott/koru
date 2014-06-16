/**
 * Dependency tracking and load/unload manager.
 * This module is also a requirejs loader plugin.
 */
define(function (require, exports, module) {
  var koru = require('./main');

  var suffix  = isClient ? '-client' : '-server';
  var loaderPrefix = module.id + "!";

  var env = {
    /**
     * Load a module for the current koru -- client or server -- and
     * call {@unload} when ready.
     *
     * This function is used by requirejs to load a dependency of the
     * format: koru/env!<name> as <name>-client.js
     */
    load: function (name, req, onload, config) {
      var provider = name + suffix;

      koru.insertDependency(loaderPrefix + name, provider);

      req([provider], function (value) {
        onload(value);
      }, onload.error);
    },
  };

  return env;
});

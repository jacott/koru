(function() {
  define(function (require, exports, module) {
    var env = require('./env');
    var core = require('./core');
    var loaderPrefix = module.id + "!";

    core.onunload(module, 'reload');

    return {
      /**
       * Load a module for the current env -- client or server -- and
       * call {@unload} when ready.
       *
       * This function is used by requirejs to load a dependency of the
       * format: bart/env!<name> as client-<name>.js
       */
      load: function (name, req, onload, config) {
        var parts = name.split(':');

        name = loaderPrefix + name;
        env.insertDependency(name, parts[0]);

        req([parts[0]], function (loader) {
          loader.load(parts.slice(1), name, function (err, result) {
            if (err) failure(err);
            else onload(result);
          });
        }, failure);

        function failure (err) {
          onload.error(err);
          env.unload(parts[0]);
        }
      },
    };
  });
})();

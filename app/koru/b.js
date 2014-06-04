(function() {
  define(function (require, exports, module) {
    var env = require('./env');
    var loaderPrefix = module.id + "!";

    env.onunload(module, 'reload');

    return {
      /**
       * FIXME get rid of this. move code into a function in env
       * only validator is using this.
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

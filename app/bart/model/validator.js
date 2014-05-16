define(function (require, exports, module) {
  var util = require('../util');
  var val = require('./validation');
  var env = require('../env');
  var validatorsPrefix = module.id.replace(/\/[^/]*$/, '/validators/');

  return {
    load: function (modules, dependantId, callback) {
      var self = this;
      var normNames = modules.map(function (name) {
        return validatorsPrefix+name+"-validator";
      });

      require(normNames, function () {
        for(var i = 0; i < arguments.length; ++i) {
          var item = arguments[i];
          env.insertDependency(dependantId, normNames[i]);
          if (typeof item === 'function') {
            var regName = util.camelize(modules[i]);
            val.register(regName, item.bind(val));
            env.onunload(normNames[i], deregisterFunc(regName));
          } else {
            for(var regName in item) {
              val.register(regName, item[regName].bind(val));
              env.onunload(normNames[i], deregisterFunc(regName));
            }
          }
        }

        callback(null, self);
      }, callback);
    },
  };

  function deregisterFunc(regName) {
    return function () {
      val.deregister(regName);
    };
  }
});

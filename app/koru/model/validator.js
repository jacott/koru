define(function (require, exports, module) {
  var util = require('../util');
  var val = require('./validation');
  var koru = require('../main');
  var validatorsPrefix = module.id.replace(/\/[^/]*$/, '/validators/');
  var loaderPrefix = module.id + "!";

  exports.load = function (name, req, onload, config) {
    var parts = name.split(':');

    name = loaderPrefix + name;

    loader(parts, name, function (err) {
      if (err) failure(err);
      else onload(exports);
    });


    function failure (err) {
      onload.error(err);
      koru.unload(parts[0]);
    }
  };


  function loader(modules, dependantId, callback) {
    var normNames = modules.map(function (name) {
      return validatorsPrefix+name+"-validator";
    });

    require(normNames, function () {
      for(var i = 0; i < arguments.length; ++i) {
        var item = arguments[i];
        koru.insertDependency(dependantId, normNames[i]);
        if (typeof item === 'function') {
          var regName = util.camelize(modules[i]);
          val.register(regName, item.bind(val));
          koru.onunload(normNames[i], deregisterFunc(regName));
        } else {
          for(var regName in item) {
            val.register(regName, item[regName].bind(val));
            koru.onunload(normNames[i], deregisterFunc(regName));
          }
        }
      }

      callback(null);
    });
  }

  function deregisterFunc(regName) {
    return function () {
      val.deregister(regName);
    };
  }
});

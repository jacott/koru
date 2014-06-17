define(['module'], function (module) {
  var validatorsPrefix = module.id.replace(/\/[^/]*$/, '/validators/');

  return {
    load: function (name, req, onload, config) {
      onload.fromText(name, text(name));
      onload();
      return;
    },

    write: function (pluginName, name, write, config) {
      write.asModule(pluginName + "!" + name, text(name));
    },
  };

  function text(name) {
    var parts = name.split(':');
    var normNames = parts.map(function (name) {
      return validatorsPrefix+name+"-validator";
    });

    return 'define('+JSON.stringify(normNames)+', function() {});';
  }
});

define(function(require, exports, module) {
  return {
    load: function (name, req, onLoad) {
      onLoad(req.module.state === module.constructor.PREPARING ? "simple " + name : 'not preparing');
    },

    write: function (pluginName, name, write) {
      write('define('+ JSON.stringify(pluginName + "!" + name) + ',' + JSON.stringify("simple " + name) + ");\n");
    },
  };
});

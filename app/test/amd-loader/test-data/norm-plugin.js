define(function(require, exports, module) {
  return {
    normalize: function (name, parent) {
      return 'norm/'+name.split('/')[0];
    },

    load: function (name, req, onLoad) {
      onLoad("hello " + name);
    },

    write: function (pluginName, name, write) {
      write('define('+ JSON.stringify(pluginName + "!" + name) + ',' + JSON.stringify("norm " + name) + ");\n");
    },
  };
});

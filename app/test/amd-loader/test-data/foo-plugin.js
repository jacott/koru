define(function(require, exports, module) {
  return {
    normalize: function (name, normalize) {
      return normalize(name.split('/').slice(-1)[0]);
    },

    load: function (name, req, onLoad) {
      req.module.exports = "hello " + name;
      req.module.delayLoad = onLoad;
    },
  };
});

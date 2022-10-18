define(function(require, exports, module) {
  return {
    load: function (name, req, onLoad) {
      onLoad.error(req.module.newError('foo'));
    },
  };
});

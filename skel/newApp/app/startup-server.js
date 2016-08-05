define(function(require, exports, module) {
  const koru       = require('koru');

  koru.onunload(module, restart);

  function restart(mod, error) {
    if (error) return;
    koru.setTimeout(() => require(module.id, start => start()));
  }

  exports = function () {
  };

  return exports;
});

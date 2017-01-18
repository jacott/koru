define(function(require, exports, module) {
  const util     = require('koru/util');
  const loadAjax = require('./load-ajax');

  exports.load = function (name, onload) {
    loadAjax(name, function (err, text) {
      if (err) onload.error(err);
      else onload(text);
    });
  };
});

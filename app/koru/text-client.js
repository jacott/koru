define(function(require, exports, module) {
  var util = require('koru/util');
  var loadAjax = require('./load-ajax');

  exports.load = function (name, onload) {
    loadAjax(name, function (err, text) {
      if (err) onload.error(err);
      else onload(text);
    });
  };
});

var fs = require('fs');

define(function(require, exports, module) {

  var util = require('koru/util');

  exports.load = function (name, onload) {
    fs.readFile(name, function (err, text) {
      util.Fiber(function () {
        if (err) onload.error(err);
        else onload(text.toString());
      }).run();
    });
  };
});

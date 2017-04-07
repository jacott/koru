const fs = require('fs');

define(function(require, exports, module) {
  const util = require('koru/util');

  exports.load = function (name, onload) {
    fs.readFile(name, (err, text) => {
      util.Fiber(() => {
        if (err) onload.error(err);
        else onload(text.toString());
      }).run();
    });
  };
});

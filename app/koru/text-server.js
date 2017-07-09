define(function(require, exports, module) {
  const koru = require('koru');
  const fs = requirejs.nodeRequire('fs');

  exports.load = (name, onload)=>{
    fs.readFile(name, (err, text) => {
      koru.runFiber(() => {
        if (err) onload.error(err);
        else onload(text.toString());
      });
    });
  };
});

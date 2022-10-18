(
  function () {
    define([
      'require', 'exports', './subdir/dep1', './simple-plugin!./fuzz', './complex-plugin!test-data/simple',
    ], (require, exports, dep1, fuzz) => {
      const util            = require('test-data/dep2');
    });
  })();

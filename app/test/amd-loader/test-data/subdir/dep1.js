define((require, exports, module) => {
  'use strict';
  const dep2            = require('../dep2');

  let count = 0;

  function dep1() {
    const name = 'test-data/dep2'; // same module; different id form
    return dep2 === require(name) && ++count === 1;
  }

  module.onUnload(function () {dep1.testUnload = true});

  return dep1;
});

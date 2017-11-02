define(function(require, exports, module) {
  const Dom             = require('koru/dom');
  const util            = require('koru/util');

  return ({View, Controller}) => {
    View.$helpers({
      id() {return "defLayout"}
    });
  };
});

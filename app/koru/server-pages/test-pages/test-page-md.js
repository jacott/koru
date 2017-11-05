define(function(require, exports, module) {
  const Dom             = require('koru/dom');
  const util            = require('koru/util');

  return ({View, Controller}) => {
    View.$helpers({
      foo() {return "Markdown"}
    });

    class TestPageMd extends Controller {
    }
    return TestPageMd;
  };
});

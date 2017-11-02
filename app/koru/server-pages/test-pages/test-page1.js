define(function(require, exports, module) {
  const Dom             = require('koru/dom');
  const util            = require('koru/util');

  return ({View, Controller}) => {
    View.$helpers({
      foo() {return this.params.id}
    });

    class TestPage1 extends Controller {
    }
    return TestPage1;
  };
});

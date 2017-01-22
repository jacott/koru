define(function (require, exports, module) {
  var test, doc;
  var geddon = require('../../test');
  var validation = require('../validation');
  var sut = require('./validate-validator').bind(validation);

  geddon.testCase(module, {
    setUp() {
      test = this;
      doc = {};
    },

    tearDown() {
      doc = null;
    },

    "test calls"() {
      var func = test.stub();

      sut(doc,'foo', func);

      assert.calledOnceWith(func, 'foo');
      assert.same(func.firstCall.thisValue, doc);
    },
  });
});

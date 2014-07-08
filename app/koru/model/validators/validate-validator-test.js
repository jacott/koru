define(function (require, exports, module) {
  var test, doc;
  var geddon = require('../../test');
  var validation = require('../validation');
  var sut = require('./validate-validator').bind(validation);

  geddon.testCase(module, {
    setUp: function () {
      test = this;
      doc = {};
    },

    tearDown: function () {
      doc = null;
    },

    "test calls": function () {
      var func = test.stub();

      sut(doc,'foo', func);

      assert.calledOnceWith(func, 'foo');
      assert.same(func.thisValues[0], doc);
    },
  });
});

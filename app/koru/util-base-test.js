define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var sut = require('./util-base');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test extendNoEnum": function () {
      var foo = {bar: 1};

      sut.extendNoEnum(foo, {
        baz: 2,

        get fnord() {return 3},
      });

      assert.equals(Object.keys(foo), ['bar']);
    },
  });
});

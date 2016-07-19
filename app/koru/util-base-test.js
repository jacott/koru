define(function (require, exports, module) {
  var test, v;
  const TH  = require('./test');
  const sut = require('./util-base');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test extendNoEnum"() {
      var foo = {bar: 1};

      sut.extendNoEnum(foo, {
        baz: 2,

        get fnord() {return 3},
      });

      assert.equals(Object.keys(foo), ['bar']);
    },

    "test extend"() {
      var orig = {a: 1, b: 2};
      var result = {};
      assert.same(sut.extend(result, orig), result);

      refute.same(result, orig);

      assert.equals(result, orig);

      assert.equals(sut.extend({a: 1}), {a: 1});
    },

    "test last"() {
      assert.same(sut.last([1, 4]), 4);
    },
  });
});

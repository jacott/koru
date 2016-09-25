define(function (require, exports, module) {
  var test, v;
  const api = require('koru/test/api');
  const TH  = require('./test');
  const sut = require('./util');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      api.module(module.get('./util'), 'util');
    },

    tearDown() {
      v = null;
    },

    "test mergeNoEnum"() {
      /**
       * Merge `source` into `dest` but do not set `enumerable` on the
       * descriptor.
       *
       **/
      api.method('mergeNoEnum');
      api.example(() => {
        const foo = {bar: 1};

        sut.mergeNoEnum(foo, {
          baz: 2,

          get fnord() {return 3},
        });

        assert.equals(Object.keys(foo), ['bar']);
        assert.same(foo.baz, 2);
        assert.same(foo.fnord, 3);
      });
    },

    "test merge"() {
      /**
       * Merge `source` into `dest`.
       *
       * @alias extend deprecated
       **/
      api.method('merge');
      var orig = {a: 1, b: 2};
      var result = {};
      assert.same(sut.merge(result, orig), result);

      refute.same(result, orig);

      assert.equals(result, orig);

      assert.equals(sut.merge({a: 1}), {a: 1});
      assert.equals(sut.merge({a: 1, b: 2}, {b: 3, c: 4}), {a: 1, b: 3, c: 4});

      const a = {a: 1, b: 2};
      const b = sut.merge(Object.create(a), {b: 3, c: 4});

      const c = {d: 5};

      const ans = sut.merge(c, b);

      assert.same(ans, c);
      assert.equals(ans, {d: 5, b: 3, c: 4});

    },

    "test last"() {
      assert.same(sut.last([1, 4]), 4);
    },
  });
});

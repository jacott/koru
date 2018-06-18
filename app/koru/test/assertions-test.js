define((require, exports, module)=>{
  const TH   = require('koru/test-helper');

  const {stub, spy, onEnd, util} = TH;

  const sut  = require('./assertions');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("deepEqual", ()=>{
      const {deepEqual} = TH.Core.util;
      const hint = {};

      assert.isTrue(deepEqual(null, null));
      assert.isTrue(deepEqual(null, undefined));
      assert.isFalse(deepEqual(null, ""));
      assert.isTrue(deepEqual({}, {}));
      assert.isFalse(deepEqual(0, -0));
      assert.isFalse(deepEqual({a: 0}, {a: -0}));
      assert.isFalse(deepEqual({a: null}, {b: null}, hint, 'keyCheck'));
      assert.same(hint.keyCheck, '\n    {a: null}\n != {b: null}\nat key = a');


      var matcher = TH.match(function (v) {return v % 2 === 0});
      assert.isTrue(deepEqual([1, 2, null], [1, matcher, TH.match.any]));
      assert.isFalse(deepEqual([1, 1], [1, matcher]));
      assert.isFalse(deepEqual([2, 2], [1, matcher]));

      assert.isTrue(deepEqual({a: 1, b: {c: 1, d: [1, {e: [false]}]}}, {a: 1, b: {c: 1, d: [1, {e: [false]}]}}));

      assert.isFalse(deepEqual({a: 1, b: {c: 1, d: [1, {e: [false]}]}}, {a: 1, b: {c: 1, d: [1, {e: [true]}]}}));
      assert.isFalse(deepEqual({a: 1, b: {c: -0, d: [1, {e: [false]}]}}, {a: 1, b: {c: 0, d: [1, {e: [false]}]}}));

      assert.isFalse(deepEqual({a: 1, b: {c: 1, d: [1, {e: [false]}]}}, {a: 1, b: {c: 1, d: [1, {e: [false], f: undefined}]}}));

      assert.isFalse(deepEqual({a: 1}, {a: "1"}));
    });
  });
});

define((require, exports, module)=>{
  /**
   * Enumerable wraps iterables with Array like methods.
   **/
  const api             = require('koru/test/api');
  const TH              = require('koru/test-helper');

  const {stub, spy, onEnd, util} = TH;

  const Enumerable = require('./enumerable');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("new", ()=>{
      /**
       * Create new Enumerable instance
       **/
      const new_Enumerable = api.new();
      //[
      const iter = new_Enumerable({*[Symbol.iterator]() {yield 1; yield 3}});
      assert.same(iter.count(), 2);
      assert.equals(Array.from(iter), [1, 3]);
      assert.same(iter.count(), 2);

      const iter2 = new_Enumerable(function *() {yield 1; yield 3});

      assert.same(iter2.count(), 2);
      assert.equals(Array.from(iter2), [1, 3]);

      //]
    });
    test("map", ()=>{
      /**
       * Map an iterater to another value
       **/
      api.protoMethod();
      //[
      const iter = new Enumerable({*[Symbol.iterator]() {yield 1; yield 3}});
      assert.equals(Array.from(iter.map(i => 2*i)), [2, 6]);
      assert.equals(iter.map(i => 2*i)[Symbol.iterator]().next(), {done: false, value: 2});
      //]
    });

    test("reduce", ()=>{
      /**
       * Run `reducer` on each member returning a single value
       **/
      api.protoMethod();
      //[
      const iter = new Enumerable({*[Symbol.iterator]() {yield 1; yield 3}});
      assert.same(iter.reduce((sum, value) => sum+value, 5), 9);
      assert.same(iter.reduce((sum, value) => sum-value), -2);
      //]
    });

    test("count", ()=>{
      /**
       * Create an iterator that counts
       **/
      api.method();
      //[
      assert.equals(Array.from(Enumerable.count(3)), [1, 2, 3]);
      assert.equals(Array.from(Enumerable.count(20, 13, 3)), [13, 16, 19]);
      //]
    });

    test("propertyValues", ()=>{
      /**
       * Create an iterator over an object's proptery values
       **/
      api.method();
      //[
      assert.equals(Array.from(Enumerable.propertyValues({a: 1, b: 2})), [1, 2]);
      //]
    });
  });
});

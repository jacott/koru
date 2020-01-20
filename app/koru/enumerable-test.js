define((require, exports, module)=>{
  'use strict';
  /**
   * Enumerable wraps iterables with Array like methods.
   **/
  const api             = require('koru/test/api');
  const TH              = require('koru/test-helper');

  const {stub, spy, util} = TH;

  const Enumerable = require('./enumerable');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("constructor", ()=>{
      /**
       * Create new Enumerable instance
       **/
      const Enumerable = api.class();
      //[
      const iter = new Enumerable({*[Symbol.iterator]() {yield 1; yield 3}});
      assert.same(iter.count(), 2);
      assert.equals(Array.from(iter), [1, 3]);
      assert.same(iter.count(), 2);

      const iter2 = new Enumerable(function *() {yield 1; yield 3; yield 5});

      assert.same(iter2.filter(i => i != 3).count(), 2);
      assert.equals(Array.from(iter2), [1, 3, 5]);

      //]
    });

    test("every", ()=>{
      /**
       * Return `true` if and only if the `test` returns a `truthy` value for every iteration.

       * @param test a function called for each iteration with the argument: `currentValue` - the
       * current value of the iterator. Should return `true` or `false`.
       **/
      api.protoMethod();
      //[
      const iter = new Enumerable({*[Symbol.iterator]() {yield 1; yield 5; yield 3}});
      assert.isTrue(iter.every(i => i));
      assert.isFalse(iter.every(i => i != 5));
      //]
    });

    test("some", ()=>{
      /**
       * Return `true` if `test` returns a `truthy` value for at least one iteration.

       * @param test a function called for each iteration with the argument: `currentValue` - the
       * current value of the iterator. Should return `true` or `false`.
       **/
      api.protoMethod();
      //[
      const iter = new Enumerable({*[Symbol.iterator]() {yield 1; yield 5; yield 3}});
      assert.isTrue(iter.some(i => i == 5));
      assert.isFalse(iter.some(i => false));
      //]
    });

    test("find", ()=>{
      /**
       * Return first iterated element that `test` returns a `truthy` value for.

       * @param test a function called for each iteration with the argument: `currentValue` - the
       * current value of the iterator. Should return `true` or `false`.
       **/
      api.protoMethod();
      //[
      const iter = new Enumerable({*[Symbol.iterator]() {yield 2; yield 5; yield 3}});
      assert.equals(iter.find(i => i%2 == 1), 5);
      assert.same(iter.find(i => i == 7), void 0);
      //]
    });

    test("filter", ()=>{
      /**
       * Filter an iterator.

       * @param test a function called for each iteration with the argument: `currentValue` - the
       * current value of the iterator. Return `true` to keep the element, otherwise `false`.
       **/
      api.protoMethod();
      //[
      const iter = new Enumerable({*[Symbol.iterator]() {yield 1; yield 5; yield 3}});
      const mapped = iter.filter(i => i != 5);
      assert.equals(mapped.count(), 2);
      assert.equals(Array.from(mapped), [1, 3]);
      assert.equals(iter.filter(i => false)[Symbol.iterator]().next(), {done: true, value: void 0});
      //]
    });

    test("map", ()=>{
      /**
       * Map (and filter) an iterator to another value. If the `mapper` returns `undefined` then the
       * value is filtered out of the results
       **/
      api.protoMethod();
      //[
      const iter = new Enumerable({*[Symbol.iterator]() {yield 1; yield 5; yield 3}});
      const mapped = iter.map(i => i == 5 ? undefined : 2*i);
      assert.equals(mapped.count(), 2);
      assert.equals(Array.from(mapped), [2, 6]);
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
       * Create an iterator over an object's property values
       **/
      api.method();
      //[
      assert.equals(Array.from(Enumerable.propertyValues({a: 1, b: 2})), [1, 2]);
      //]
    });
  });
});

define((require, exports, module) => {
  'use strict';
  /**
   * Enumerable wraps iterables with Array like methods.
   */
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  const Enumerable = require('./enumerable');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('constructor', () => {
      /**
       * Create new Enumerable instance
       */
      const Enumerable = api.class();
      //[
      const source = {
        *[Symbol.iterator]() {
          yield 1;
          yield 3;
        },
      };
      let iter = new Enumerable(source);
      assert.same(iter.count(), 2);
      assert.equals(Array.from(iter), []);

      iter = new Enumerable(source);
      assert.equals(Array.from(iter), [1, 3]);
      assert.same(iter.count(), 0); // iter is consumed

      const iter2 = new Enumerable(function* () {
        yield 1;
        yield 3;
        yield 5;
      });

      assert.same(iter2.filter((i) => i != 3).count(), 2);
      assert.equals(Array.from(iter2), []);
      //]
    });

    test('reverseValues', () => {
      /**
       * Return an iterator for the reverse values of an array like structure
       */
      api.method();
      //[
      assert.equals(Array.from(Enumerable.reverseValues([1, 2, 3])), [3, 2, 1]);
      //]
    });

    test('every', () => {
      /**
       * Return `true` if and only if the `test` returns a `truthy` value for every iteration.

       * @param test a function called for each iteration with the argument: `currentValue` - the
       * current value of the iterator. Should return `true` or `false`.
       **/
      api.protoMethod();
      //[
      const source = {
        *[Symbol.iterator]() {
          yield 1;
          yield 5;
          yield 3;
        },
      };
      assert.isTrue(new Enumerable(source).every((i) => i));
      assert.isFalse(new Enumerable(source).every((i) => i != 5));
      //]
    });

    test('some', () => {
      /**
       * Return `true` if `test` returns a `truthy` value for at least one iteration.

       * @param test a function called for each iteration with the argument: `currentValue` - the
       * current value of the iterator. Should return `true` or `false`.
       **/
      api.protoMethod();
      //[
      const source = {
        *[Symbol.iterator]() {
          yield 1;
          yield 5;
          yield 3;
        },
      };
      assert.isTrue(new Enumerable(source).some((i) => i == 5));
      assert.isFalse(new Enumerable(source).some((i) => false));
      //]
    });

    test('find', () => {
      /**
       * Return first iterated element that `test` returns a `truthy` value for.

       * @param test a function called for each iteration with the argument: `currentValue` - the
       * current value of the iterator. Should return `true` or `false`.
       **/
      api.protoMethod();
      //[
      const source = {
        *[Symbol.iterator]() {
          yield 2;
          yield 5;
          yield 3;
        },
      };
      assert.equals(new Enumerable(source).find((i) => i % 2 == 1), 5);
      assert.same(new Enumerable(source).find((i) => i == 7), void 0);
      //]
    });

    test('filter', () => {
      /**
       * Filter an iterator.

       * @param test a function called for each iteration with the argument: `currentValue` - the
       * current value of the iterator. Return `true` to keep the element, otherwise `false`.
       **/
      api.protoMethod();
      //[
      const source = {
        *[Symbol.iterator]() {
          yield 1;
          yield 5;
          yield 3;
        },
      };
      const mapped = new Enumerable(source).filter((i) => i != 5);
      assert.equals(Array.from(mapped), [1, 3]);
      assert.equals(new Enumerable(source).filter((i) => false)[Symbol.iterator]().next(), {
        done: true,
        value: undefined,
      });
      //]
    });

    test('skip', () => {
      /**
       * Return an Enumerable that skips the first `n` elements.
       */
      api.protoMethod();
      //[
      const source = {
        *[Symbol.iterator]() {
          yield 1;
          yield 5;
          yield 3;
          yield 6;
        },
      };
      assert.equals(Array.from(new Enumerable(source).skip(2)), [3, 6]);
      assert.equals(Array.from(new Enumerable(source).skip(1).skip(2)), [6]);
      //]
    });

    test('take', () => {
      /**
       * Return an Enumerable that takes only the first `n` elements.
       */
      api.protoMethod();
      //[
      const source = {
        *[Symbol.iterator]() {
          yield 1;
          yield 5;
          yield 3;
          yield 6;
        },
      };
      assert.equals(Array.from(new Enumerable(source).take(2)), [1, 5]);
      assert.equals(Array.from(new Enumerable(source).take(3).skip(1)), [5, 3]);
      assert.equals(Array.from(new Enumerable(source).skip(1).take(2)), [5, 3]);
      //]
    });

    test('mapToArray', () => {
      /**
       * Map (and filter) an iterator to another value. If the `mapper` returns `undefined` then the
       * value is filtered out of the results
       */
      api.method();
      //[
      const mapped = Enumerable.mapToArray({
        *[Symbol.iterator]() {
          yield 1;
          yield 5;
          yield 3;
        },
      }, (i) => i == 5 ? undefined : 2 * i);
      assert.equals(mapped.length, 2);
      assert.equals(mapped, [2, 6]);
      //]
    });

    test('mapObjectToArray', () => {
      /**
       * Map (and filter) an object to array. If the `mapper` returns `undefined` then the
       * value is filtered out of the results
       */
      api.method();
      //[
      const obj = {a: 1, b: 2, c: 3, d: 4};
      const mapped = Enumerable.mapObjectToArray(obj, (n, v, i) => (i == 2) ? undefined : 2 * v);
      assert.equals(mapped.length, 3);
      assert.equals(mapped, [2, 4, 8]);
      //]
    });

    test('mapObjectIter', () => {
      /**
       * return an iterator over an object while mapping (and filtering). If the `mapper` returns
       * `undefined` then the value is filtered out of the iterator results
       */
      api.method();
      //[
      const obj = {a: 1, b: 2, c: 3, d: 4};
      const names = [], values = [];
      for (
        const [n, v] of Enumerable.mapObjectIter(obj, (n, v, i) =>
          (i == 2) ? undefined : 2 * v)
      ) {
        names.push(n);
        values.push(v);
      }
      assert.equals(names, ['a', 'b', 'd']);
      assert.equals(values, [2, 4, 8]);
      //]
    });

    test('filterMap', () => {
      /**
       * Filter and map an iterator to another value. If the `mapper` returns `undefined` then the
       * value is filtered out of the results
       */
      api.protoMethod();
      //[
      const source = {
        *[Symbol.iterator]() {
          yield 1;
          yield 5;
          yield 3;
        },
      };
      const mapped = new Enumerable(source).filterMap((i) => i == 5 ? undefined : 2 * i);
      assert.equals(Array.from(mapped), [2, 6]);
      assert.equals(new Enumerable(source).filterMap((i) => 2 * i)[Symbol.iterator]().next(), {
        done: false,
        value: 2,
      });
      //]
    });

    test('reduce', () => {
      /**
       * Run `reducer` on each member returning a single value
       */
      api.protoMethod();
      //[
      const source = {
        *[Symbol.iterator]() {
          yield 1;
          yield 3;
        },
      };
      assert.same(new Enumerable(source).reduce((sum, value) => sum + value, 5), 9);
      assert.same(new Enumerable(source).reduce((sum, value) => sum - value), -2);
      //]
    });

    test('forEach', () => {
      /**
       * Run `callback` on each member
       */
      api.protoMethod();
      //[
      let a = 0;
      new Enumerable([1, 3]).forEach((n) => a += n);
      assert.same(a, 4);
      new Enumerable([5, 7]).forEach((n) => a *= n);
      assert.same(a, 140);
      //]
    });

    test('toObject', () => {
      /**
       * Run `callback` on each member passing an object and the current iter entry.
       */
      api.protoMethod();
      //[
      const iter = new Enumerable({
        *[Symbol.iterator]() {
          yield 'a';
          yield 'b';
        },
      });
      assert.equals(iter.toObject((o, value) => o[value] = value), {a: 'a', b: 'b'});
      //]
    });

    test('count', () => {
      /**
       * Create an iterator that counts
       */
      api.method();
      //[
      assert.equals(Array.from(Enumerable.count(3)), [1, 2, 3]);
      assert.equals(Array.from(Enumerable.count(20, 13, 3)), [13, 16, 19]);
      //]
    });

    test('propertyKeys', () => {
      /**
       * Create an iterator over an object's property keys
       */
      api.method();
      //[
      assert.equals(Array.from(Enumerable.propertyKeys({a: 1, b: 2})), ['a', 'b']);
      //]
    });

    test('propertyValues', () => {
      /**
       * Create an iterator over an object's property values
       */
      api.method();
      //[
      assert.equals(Array.from(Enumerable.propertyValues({a: 1, b: 2})), [1, 2]);
      //]
    });

    test('asArray', () => {
      /**
       * Convert object to array, if not already.
       */
      api.method();
      //[
      assert.equals(Enumerable.asArray({a: 1, b: 2}), [1, 2]);

      const a = [1, 2, 3, 4];
      assert.same(Enumerable.asArray(a), a);

      assert.equals(Enumerable.asArray(Enumerable.count(3)), [1, 2, 3]);

      assert.equals(Enumerable.asArray('hello'), ['h', 'e', 'l', 'l', 'o']);
      assert.equals(Enumerable.asArray(123), [123]);
      assert.equals(Enumerable.asArray(new Set([1, 2, 3])), [1, 2, 3]);
      assert.equals(Enumerable.asArray(), []);
      //]
    });
  });
});

define((require, exports, module) => {
  'use strict';
  /**
   * The heart of the test framework.
   **/
  const match           = require('koru/match');
  const Stacktrace      = require('koru/stacktrace');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util, match: m} = TH;

  const Core = require('./core');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {

    test('properties', () => {
      assert.same(Core, TH.Core);
      api.property('test', {info: 'The currently running test'});
      assert.same(Core.test.name, 'koru/test/core test properties.');

      api.property('__elidePoint', {info: `
The current \`elidePoint\` in effect (if any) is an \`AssertionError\` used to replace the stack
trace of the actual error. Access can be useful to save and restore in custom assertion methods.
`});
      api.property('AssertionError', {info: 'the {#::AssertionError} class'});
      assert.same(Core.__elidePoint, void 0);
      assert.elideFromStack.same(Core.__elidePoint.constructor, Core.AssertionError);
      Core.__elidePoint = new Core.AssertionError();

      api.property('match', {info: `
A clone of the {#koru/match} framework. This is conventionally assigned to the constant \`m\`
because of its widespread use.
`});
      assert.same(Core.match, match[isTest]);
    });

    group('AssertionError', () => {
      /**
       * An error thrown by an assertion methods.
       **/
      let aeApi;
      before(() => {
        aeApi = api.innerSubject(Core.AssertionError, null);
      });

      after(() => {aeApi = undefined});

      test('constructor', () => {
        /**
         * Create an AssertionError.

         * @param message the message for the error

         * @param elidePoint if a `number` the number of stack frames to elide otherwise will show
         * `elidePoint`'s normalized stack instead. See {#koru/util.extractError} and {#koru/stacktrace}
         **/
        aeApi.protoProperty('customStack', {
          info: `The normalized stack trace with the elided frames and message`});
        let {AssertionError} = Core;
        //[
        const inner1 = () => {inner2()};
        const inner2 = () => {inner3()};
        const inner3 = () => {
          const err = new AssertionError('I failed');
          assert(err instanceof Error);
          assert.same(err.message, 'I failed');
          assert.equals(Stacktrace.normalize(err), [
            m(/    at .*inner3.* \(koru\/test\/core-test.js:\d+:\d+\)/),
            m(/    at .*inner2.* \(koru\/test\/core-test.js:\d+:\d+\)/),
            m(/    at .*inner1.* \(koru\/test\/core-test.js:\d+:\d+\)/),
            m(/    at .* \(koru\/test\/core-test.js:\d+:\d+\)/),
          ]);

          const err2 = new AssertionError('I have a shortened customStack', 2);
          assert.equals(Stacktrace.normalize(err).slice(2), Stacktrace.normalize(err2));

          const err3 = (() => new AssertionError('I use another stack', err2))();
          assert.same(Stacktrace.normalize(err3), Stacktrace.normalize(err2));
        };
        inner1();
        //]
        AssertionError = aeApi.class();
        const a1 = new AssertionError('message');
        const a2 = new AssertionError('message', 1);
        const a3 = new AssertionError('message', a1);
      });
    });

    test('fail', () => {
      /**
       * throw assertionError
       *
       * @param message the error message

       * @param elidePoint the number of stack frames to elide
       **/
      //[
      let ex;
      const inner1 = () => {inner2()};
      const inner2 = () => {
        try {
          assert.fail('I failed', 1);
        } catch(e) {
          ex = e;
        }
      };

      inner1();

      assert.instanceof(ex, Core.AssertionError);
      assert.same(ex.message, 'I failed');
      assert.equals(Stacktrace.normalize(ex), [
        m(/^    at.*inner1.*core-test.js/),
        m(/^    at.*core-test.js/),
      ]);
      //]
      api.customIntercept(assert, {name: 'fail', sig: 'assert.'});
      assert.exception(() => {assert.fail()});
      assert.exception(() => {assert.fail('test1')});
      assert.exception(() => {assert.fail('test2', 1)});
    });

    test('elide', () => {
      /**
       * Elide stack starting from caller
       *
       * @param body the elided body to excute

       * @param adjust the number of additional stack frames to elide.
       **/
      //[
      const inner = () => {
        assert.fail('I failed');
      };

      let ex;
      try {
        (() => {
          assert.elide(() => {
            inner();
          }, 1);
        })();
      } catch(e) {
        ex = e;
      }
      assert.instanceof(ex, Core.AssertionError);
      assert.same(ex.message, 'I failed');
      assert.equals(ex.customStack, new Core.AssertionError('I failed', 1).customStack);

      //]
      // api trace here because intercept will interfere with stack trace
      api.customIntercept(assert, {name: 'elide', sig: 'assert.'});
      try {
        assert.elide(() => {inner()});
      } catch (ex) {
      }
      try {
        assert.elide(() => {inner()}, 1);
      } catch (ex) {
      }
    });

    test('assert', () => {
      /**
       * Assert is truthy. Contains methods for more convenient assertions in {#::assert}. `assert`
       * is a global method.
       *
       * @param {boolean} truth `!! truth === true` otherwise an {#::AssertionError} is thrown.
       *
       * @param msg A message to display if the assertion fails
       **/
      api.method();
      //[
      let ex;
      //]
      {
        const {assert} = Core;
        //[
        try {
          assert(1, 'I succeeded');
          assert(true, 'So did I');
          assert(0, 'I failed');
        } catch(e) {
          ex = e;
        }
        //]
      }
      //[
      assert.instanceof(ex, Core.AssertionError);
      assert.same(ex.message, 'I failed');
      //]
    });

    test('refute', () => {
      /**
       * Assert is falsy. Contains methods for more convenient assertions in {#::assert}. `refute`
       * is a global method.
       *
       * @param {boolean} truth `!! truth === false` otherwise an {#::AssertionError} is thrown.
       *
       * @param msg A message to display if the assertion fails
       **/
      api.method();
      //[
      let ex;
      //]
      {
        const {assert} = Core;
        //[
        try {
          refute(0, 'I succeeded');
          refute(false, 'So did I');
          refute(true, 'I failed');
        } catch(e) {
          ex = e;
        }
        //]
      }
      //[
      assert.instanceof(ex, Core.AssertionError);
      assert.same(ex.message, 'I failed');
      //]
    });

    test('deepEqual', () => {
      /**
       * Like {#koru/util.deepEqual} except allows a hint to show where values don't match.
       **/
      api.method();
      const {deepEqual} = TH.Core;
      const hint = {};

      assert.isTrue(deepEqual(null, null));
      assert.isTrue(deepEqual(null, undefined));
      assert.isFalse(deepEqual(null, ''));
      assert.isTrue(deepEqual({}, {}));
      assert.isFalse(deepEqual(0, -0));
      assert.isFalse(deepEqual({a: 0}, {a: -0}));
      assert.isFalse(deepEqual({a: null}, {b: null}, hint, 'keyCheck'));
      assert.same(hint.keyCheck, '\n    {a: null}\n != {b: null}\nat key = a');

      const matcher = TH.match((v) => v % 2 === 0);
      assert.isTrue(deepEqual([1, 2, null], [1, matcher, TH.match.any]));
      assert.isFalse(deepEqual([1, 1], [1, matcher]));
      assert.isFalse(deepEqual([2, 2], [1, matcher]));

      assert.isTrue(deepEqual({a: 1, b: {c: 1, d: [1, {e: [false]}]}},
                              {a: 1, b: {c: 1, d: [1, {e: [false]}]}}));

      assert.isFalse(deepEqual({a: 1, b: {c: 1, d: [1, {e: [false]}]}},
                               {a: 1, b: {c: 1, d: [1, {e: [true]}]}}));
      assert.isFalse(deepEqual({a: 1, b: {c: -0, d: [1, {e: [false]}]}},
                               {a: 1, b: {c: 0, d: [1, {e: [false]}]}}));

      assert.isFalse(deepEqual({a: 1, b: {c: 1, d: [1, {e: [false]}]}},
                               {a: 1, b: {c: 1, d: [1, {e: [false], f: undefined}]}}));

      assert.isFalse(deepEqual({a: 1}, {a: '1'}));
    });

    test('deepEqual object key mismatch', () => {
      const a = {e: 1, a: 2, c: 3};
      const b = {...a, b: 4};
      const hint = {};
      assert.isFalse(TH.Core.deepEqual(a, b, hint, 'x'));

      const exp =     ' keys differ:\n' +
            "    ''\n" +
            " != 'b'\n" +
            '    {e: 1, a: 2, c: 3}\n' +
            ' != {e: 1, a: 2, c: 3, b: 4}';
      assert.equals(hint.x, exp);
    });

    group('deepEqual string failure message', () => {
      const {deepEqual} = TH.Core;
      const a = '1234567890123456789012345\n';

      test('missing nl', () => {
        const b = a.slice(0, -4);
        const hint = {};
        assert.isFalse(deepEqual(a, b, hint, 'x'));

        const exp = '\n'+
              '    "1234567890123456789012345\\n"\n' +
              ' != "1234567890123456789012"\n' +
              '---------------------------^ here';

        assert.equals(hint.x, exp);
      });

      test('is longer', () => {
        const b = a + 'abcd\n';
        const hint = {};
        assert.isFalse(deepEqual(a, b, hint, 'x'));

        const exp = '\n' +
              "    '1234567890123456789012345\\n'\n" +
              " != '1234567890123456789012345\\n' +\n" +
              "    'abcd\\n'\n" +
              ' Is longer';

        assert.equals(hint.x, exp);
      });

      test('is shorter', () => {
        const b = a + 'abcd\n';
        const hint = {};
        assert.isFalse(deepEqual(b, a, hint, 'x'));

        const exp = '\n' +
              "    '1234567890123456789012345\\n' +\n" +
              "    'abcd\\n'\n" +
              " != '1234567890123456789012345\\n'\n" +
              ' Is shorter';

        assert.equals(hint.x, exp);
      });

      test('middle diff', () => {
        const hint = {};
        const b = '1798'.split('');

        b[1] = '7xxabc';

        assert.isFalse(deepEqual('1789'.split('').join('xxxxxx\n')+'\n',
                                 b.join('xxxxxx\n'), hint, 'x'));

        const exp = '\n' +
              "    '1xxxxxx\\n' +\n" +
              '    "7xxxxxx\\n" +\n' +
              '    "8xxxxxx\\n" +\n' +
              '    "9\\n"\n' +
              " != '1xxxxxx\\n' +\n" +
              '    "7xxabcxxxxxx\\n"\n' +
              '--------^ here +\n' +
              '    "9xxxxxx\\n" +\n' +
              '    "8"';

        assert.equals(hint.x, exp);
      });
    });
  });
});

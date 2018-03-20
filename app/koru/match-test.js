define(function (require, exports, module) {
  const sut = require('./match');
  const TH  = require('./test-helper');

  let v = null;

  TH.testCase(module, {
    setUp() {
      v = {};
      v.assertThrows =  (m, v, msg)=>{
        let aMsg;
        try {
          m.$throwTest(v);
          assert.msg("failed")(false);
        }
        catch(ex) {aMsg = ex;}
        assert.elideFromStack.same(aMsg, msg);
      };
    },

    tearDown() {
      v = null;
    },

    "test match.optional"() {
      assert.isTrue(sut.optional.id.$test(null));
      assert.isTrue(sut.optional.id.$test(undefined));
      assert.isTrue(sut.optional.id.$test("aAgGzZqQ8901234567890123"));
      assert.isFalse(sut.optional.id.$test("0123456789012345678901234"));

      assert.isTrue(sut.optional.date.$test(null));

      assert.isTrue(sut.optional.string.$test(null));
      assert.isTrue(sut.optional.string.$test('0'));
      assert.isFalse(sut.optional.string.$test(0));

      assert.isTrue(sut.optional(sut.string).$test(null));
      assert.isFalse(sut.optional(sut.string).$test(0));
    },

    "test match.id"() {
      assert.isTrue(sut.id.$test("123"));
      assert.isTrue(sut.id.$test("aAgGzZqQ8901234567890123"));
      assert.isFalse(sut.id.$test("0123456789012345678901234"));
      assert.isFalse(sut.id.$test("12"));
      assert.isFalse(sut.id.$test("undefined"));
    },

    "test non function construction"() {
      assert(sut(/abc/).$test('aabcc'));
      refute(sut(/abc/).$test('aabbcc'));
      assert(sut([1, sut.any]).$test([1, 'foo']));
      refute(sut([2, sut.any]).$test([1, 'foo']));
    },

    "test match naming"() {
      assert.same(''+sut(arg => true), "match(arg => true)");
      assert.same(''+sut(function (arg) {return true}), "match(function (arg) {return true})");
      assert.same(''+sut(function fooMatch(arg) {return true}), 'match(fooMatch)');
      assert.same(''+sut(function (arg) {return true}, 'my message'), 'my message');

      assert.same(''+sut.optional.string, 'match.string[opt]');
      assert.same(''+sut.string, 'match.string');
      assert.same(''+sut.boolean, 'match.boolean');
      assert.same(''+sut.number, 'match.number');
      assert.same(''+sut.undefined, 'match.undefined');
      assert.same(''+sut.null, 'match.null');
      assert.same(''+sut.nil, 'match.nil');
      assert.same(''+sut.date, 'match.date');
      assert.same(''+sut.function, 'match.function');
      assert.same(''+sut.func, 'match.func');
      assert.same(''+sut.object, 'match.object');
      assert.same(''+sut.baseObject, 'match.baseObject');
      assert.same(''+sut.any, 'match.any');
      assert.same(''+sut.match, 'match.match');
    },

    "test match.equal"() {
      const me = sut.equal([1,sut.any]);
      assert.isTrue(me.$test([1,'x']));
      assert.isTrue(me.$test([1, null]));
      assert.isFalse(me.$test([1]));
      assert.isFalse(me.$test([1, 1, null]));
      assert.isFalse(me.$test([2, 1]));
      v.assertThrows(me, [3], 'match.equal');
      assert.isTrue(me.$throwTest([1, null]));
    },

    "test match.symbol"() {
      assert.isTrue(sut.symbol.$test(Symbol()));
      assert.isFalse(sut.symbol.$test({}));
    },

    "test match.is"() {
      const me = sut.is(v.foo = {foo: 123});
      assert.isTrue(me.$test(v.foo));
      assert.isFalse(me.$test({foo: 123}));
    },

    "test match.regExp"() {
      const mr = sut.regExp(/^ab*c$/i);

      assert.isTrue(mr.$test("abbbc"));
      assert.isFalse(mr.$test("abbbcd"));
    },

    "test match.between"() {
      const mb = sut.between(6, 9);
      assert.isTrue(mb.$test(6));
      assert.isTrue(mb.$test(7.5));
      assert.isTrue(mb.$test(9));
      assert.isFalse(mb.$test(9.1));
      assert.isFalse(mb.$test(5.9));


      const mbe = sut.between(6, 9, false, true);
      assert.isFalse(mbe.$test(6));
      assert.isTrue(mbe.$test(7.5));
      assert.isTrue(mbe.$test(9));
      assert.isTrue(mb.$test(6.1));
      assert.isFalse(mb.$test(5.9));

      const mbtf = sut.between(6, 9, true, false);
      assert.isTrue(mbtf.$test(6));
    },

    "test match.has"() {
      const mi = sut.has({a: 0, b: 2});

      assert.isTrue(mi.$test('a'));
      assert.isTrue(mi.$test('b'));
      assert.isFalse(mi.$test('c'));
    },

    "test match.or"() {
      let mor = sut.or(sut.number, sut.string, sut.boolean, 'mymatch');

      assert.same(mor.message, 'mymatch');

      assert.isTrue(mor.$test(1));
      assert.isTrue(mor.$test(0));
      assert.isTrue(mor.$test(''));
      assert.isTrue(mor.$test(false));
      assert.isFalse(mor.$test([]));
      assert.isFalse(mor.$test({}));
      assert.isFalse(mor.$test(null));
      v.assertThrows(mor, new Date(), 'mymatch');

      mor = sut.or(sut.number, sut.string);
      assert.isTrue(mor.$test(1));
      assert.isTrue(mor.$test("a"));
      assert.isFalse(mor.$test(false));
    },

    "test match.and"() {
      const mand = sut.and(sut.object, sut.baseObject, sut.equal({a: sut.number}), 'mymatch');

      assert.same(mand.message, 'mymatch');

      assert.isTrue(mand.$test({a: 1}));
      assert.isTrue(mand.$test({a: 0}));
      assert.isFalse(mand.$test(new Date()));
      assert.isFalse(mand.$test({a: 'x'}));
      assert.isFalse(mand.$test(null));
      v.assertThrows(mand, new Date(), 'match.baseObject');
      v.assertThrows(mand, 1, 'match.object');
      v.assertThrows(mand, {b: 'x'}, 'match.equal');
      v.assertThrows(mand, {a: 'x'}, 'match.equal');
    },

    "test match.tuple"() {
      const mtup = sut.tuple([sut.object, sut.number, sut.equal({a: sut.number})]);

      assert.same(mtup.message, 'match.tuple');

      assert.isTrue(mtup.$test([new Date(), 1, {a: 1}]));
      assert.isTrue(mtup.$test([{}, 0, {a: 0}]));
      assert.isFalse(mtup.$test(new Date()));
      assert.isFalse(mtup.$test([{}, 1, {a: 'x'}]));
      v.assertThrows(mtup, [new Date(), 'a', 1], 'match.number');
      v.assertThrows(mtup, [1, 2, 3], 'match.object');
      v.assertThrows(mtup, [{}, 1, {b: 'x'}], 'match.equal');
      v.assertThrows(mtup, [1, {a: 'x'}], 'match.tuple');
      v.assertThrows(mtup, {}, 'match.tuple');

      const opt = sut.optional(sut.tuple([sut.number, sut.string]));

      assert.isTrue(opt.$test(null));
      assert.isTrue(opt.$test([1, '2']));
      assert.isFalse(opt.$test(['1', 2]));

      v.assertThrows(opt, ['1', 2], 'match.number');
    },

    "test matching"() {
      assert.isTrue(sut.string.$test(''));
      assert.isFalse(sut.string.$test(1));

      assert.isTrue(sut.undefined.$test());
      assert.isFalse(sut.undefined.$test(''));
      assert.isFalse(sut.undefined.$test(null));

      assert.isTrue(sut.null.$test(null));
      assert.isFalse(sut.null.$test(''));
      assert.isFalse(sut.null.$test(undefined));

      assert.isTrue(sut.nil.$test(null));
      assert.isFalse(sut.nil.$test(''));
      assert.isTrue(sut.nil.$test(undefined));

      assert.isTrue(sut.date.$test(new Date));
      assert.isFalse(sut.date.$test(''));
      assert.isFalse(sut.date.$test({}));
      assert.isFalse(sut.date.$test(new Date('invalid')));

      assert.isTrue(sut.integer.$test(1234));
      assert.isFalse(sut.integer.$test('1234'));
      assert.isFalse(sut.integer.$test(1.1));

      assert.isTrue(sut.any.$test());
      assert.isTrue(sut.any.$test({}));
      assert.isTrue(sut.any.$test('hello'));

      assert.isTrue(sut.func.$test(function () {}));
      assert.isFalse(sut.func.$test({}));
      assert.isFalse(sut.func.$test('hello'));

      assert.same(sut.func.$test, sut.function.$test);

      assert.isTrue(sut.object.$test({}));
      assert.isTrue(sut.object.$test(sut.string));
      assert.isFalse(sut.object.$test(null));
      assert.isFalse(sut.object.$test(function () {}));
      assert.isTrue(sut.object.$test(new Date));
      assert.isFalse(sut.object.$test('hello'));

      assert.isTrue(sut.baseObject.$test({}));
      assert.isFalse(sut.baseObject.$test(sut.string));
      assert.isFalse(sut.baseObject.$test(null));
      assert.isFalse(sut.baseObject.$test(function () {}));
      assert.isFalse(sut.baseObject.$test(new Date));
      assert.isFalse(sut.baseObject.$test('hello'));

      assert.isTrue(sut.match.$test(sut.string));
      assert.isTrue(sut.match.$test(sut(function () {})));
      assert.isFalse(sut.match.$test(null));
      assert.isFalse(sut.match.$test({}));
    },
  });
});

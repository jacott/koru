define((require, exports, module)=>{
  /**
   * Match allows objects to be tested for equality against a range of pre-built or custom matchers.
   * The {#koru/util.deepEqual} function will honour any matchers found in the `expected` (second)
   * argument.
   **/
  const api             = require('koru/test/api');
  const TH              = require('./test-helper');

  const {inspect$} = require('koru/symbols');

  const match = require('./match');

  const assertThrows = (m, v, msg)=>{
    let aMsg;
    try {
      m.$throwTest(v);
      assert.msg("failed")(false);
    }
    catch(ex) {aMsg = ex;}
    assert.elideFromStack.same(aMsg, msg);
  };

  const docProp = (name, info=`match any ${name}`)=>{
    api.property(name, {info});
  };

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("custom matchers", ()=>{
      /**
       * Build a custom matcher.
       *
       * @param {Function|RegExp|Array} test used to test for truthfulness

       * @param [name] override the default name for the matcher.
       **/
      const sut = match;
      {
        let match = api.custom(sut);
        //[
        const match5 = match(arg => arg == 5);
        assert.isTrue(match5.test(5));
        assert.isTrue(match5.test("5"));
        assert.isFalse(match5.test(4));
        assert.same(''+match(()=>true, 'my message'), 'my message');
        //]

        api.done();
      }

      //[
      assert(match(/abc/).test('aabcc'));
      refute(match(/abc/).test('aabbcc'));
      assert(match([1, match.any]).test([1, 'foo']));
      refute(match([2, match.any]).test([1, 'foo']));
      //]
    });

    test("match.optional", ()=>{
      docProp('optional', 'match a standard matcher or null or undefined; `match.optional.date`');
      assert.isTrue(match.optional.id.test(null));
      assert.isTrue(match.optional.id.test(undefined));
      assert.isTrue(match.optional.id.test("aAgGzZqQ8901234567890123"));
      assert.isFalse(match.optional.id.test("0123456789012345678901234"));

      assert.isTrue(match.optional.date.test(null));

      assert.isTrue(match.optional.string.test(null));
      assert.isTrue(match.optional.string.test('0'));
      assert.isFalse(match.optional.string.test(0));

      assert.isTrue(match.optional(match.string).test(null));
      assert.isFalse(match.optional(match.string).test(0));
    });

    test("match.id", ()=>{
      docProp('id', 'match a valid model `_id`');
      assert.isTrue(match.id.test("123"));
      assert.isTrue(match.id.test("aAgGzZqQ8901234567890123"));
      assert.isFalse(match.id.test("0123456789012345678901234"));
      assert.isFalse(match.id.test("12"));
      assert.isFalse(match.id.test("undefined"));
    });

    test("match naming", ()=>{
      assert.same(''+match(arg => true), "match(arg => true)");
      assert.same(''+match(function (arg) {return true}), "match(function (arg) {return true})");
      assert.same(''+match(function fooMatch(arg) {return true}), 'match(fooMatch)');
      assert.same(''+match(function (arg) {return true}, 'my message'), 'my message');

      assert.same(''+match.optional.string, 'match.string[opt]');
      assert.same(''+match.string, 'match.string');
      assert.same(''+match.boolean, 'match.boolean');
      assert.same(''+match.number, 'match.number');
      assert.same(''+match.undefined, 'match.undefined');
      assert.same(''+match.null, 'match.null');
      assert.same(''+match.nil, 'match.nil');
      assert.same(''+match.date, 'match.date');
      assert.same(''+match.function, 'match.function');
      assert.same(''+match.func, 'match.func');
      assert.same(''+match.object, 'match.object');
      assert.same(''+match.baseObject, 'match.baseObject');
      assert.same(''+match.any, 'match.any');
      assert.same(''+match.match, 'match.match');
    });

    test("match.equal", ()=>{
      /**
       * Match `expected` using {#koru/util.deepEqual}
       **/
      api.customIntercept(match, {name: 'equal', sig: 'match.'});
      //[
      const me = match.equal([1,match.any]);

      assert.isTrue(me.test([1,'x']));
      assert.isTrue(me.test([1, null]));
      assert.isFalse(me.test([1]));
      assert.isFalse(me.test([1, 1, null]));
      assert.isFalse(me.test([2, 1]));
      //]
      assertThrows(me, [3], 'match.equal');
      assert.isTrue(me.$throwTest([1, null]));
    });

    test("match.symbol", ()=>{
      docProp('symbol');
      assert.isTrue(match.symbol.test(Symbol()));
      assert.isFalse(match.symbol.test({}));
    });

    test("match.is", ()=>{
      /**
       * Match exactly; like `Object.is`
       **/
      api.customIntercept(match, {name: 'is', sig: 'match.'});
      const foo = {foo: 123};
      const me = match.is(foo);
      assert.isTrue(me.test(foo));
      assert.isFalse(me.test({foo: 123}));
    });

    test("match.regExp", ()=>{
      const mr = match.regExp(/^ab*c$/i);

      assert.isTrue(mr.test("abbbc"));
      assert.isFalse(mr.test("abbbcd"));
    });

    test("match.between", ()=>{
      const mb = match.between(6, 9);
      assert.isTrue(mb.test(6));
      assert.isTrue(mb.test(7.5));
      assert.isTrue(mb.test(9));
      assert.isFalse(mb.test(9.1));
      assert.isFalse(mb.test(5.9));


      const mbe = match.between(6, 9, false, true);
      assert.isFalse(mbe.test(6));
      assert.isTrue(mbe.test(7.5));
      assert.isTrue(mbe.test(9));
      assert.isTrue(mb.test(6.1));
      assert.isFalse(mb.test(5.9));

      const mbtf = match.between(6, 9, true, false);
      assert.isTrue(mbtf.test(6));
    });

    test("match.has", ()=>{
      const mi = match.has({a: 0, b: 2});

      assert.isTrue(mi.test('a'));
      assert.isTrue(mi.test('b'));
      assert.isFalse(mi.test('c'));
    });

    test("match.or", ()=>{
      let mor = match.or(match.number, match.string, match.boolean, 'mymatch');

      assert.same(mor.message, 'mymatch');

      assert.isTrue(mor.test(1));
      assert.isTrue(mor.test(0));
      assert.isTrue(mor.test(''));
      assert.isTrue(mor.test(false));
      assert.isFalse(mor.test([]));
      assert.isFalse(mor.test({}));
      assert.isFalse(mor.test(null));
      assertThrows(mor, new Date(), 'mymatch');

      mor = match.or(match.number, match.string);
      assert.isTrue(mor.test(1));
      assert.isTrue(mor.test("a"));
      assert.isFalse(mor.test(false));
    });

    test("match.and", ()=>{
      const mand = match.and(match.object, match.baseObject, match.equal({a: match.number}), 'mymatch');

      assert.same(mand.message, 'mymatch');

      assert.isTrue(mand.test({a: 1}));
      assert.isTrue(mand.test({a: 0}));
      assert.isFalse(mand.test(new Date()));
      assert.isFalse(mand.test({a: 'x'}));
      assert.isFalse(mand.test(null));
      assertThrows(mand, new Date(), 'match.baseObject');
      assertThrows(mand, 1, 'match.object');
      assertThrows(mand, {b: 'x'}, 'match.equal');
      assertThrows(mand, {a: 'x'}, 'match.equal');
    });

    test("match.tuple", ()=>{
      const mtup = match.tuple([match.object, match.number, match.equal({a: match.number})]);

      assert.same(mtup.message, 'match.tuple');

      assert.isTrue(mtup.test([new Date(), 1, {a: 1}]));
      assert.isTrue(mtup.test([{}, 0, {a: 0}]));
      assert.isFalse(mtup.test(new Date()));
      assert.isFalse(mtup.test([{}, 1, {a: 'x'}]));
      assertThrows(mtup, [new Date(), 'a', 1], 'match.number');
      assertThrows(mtup, [1, 2, 3], 'match.object');
      assertThrows(mtup, [{}, 1, {b: 'x'}], 'match.equal');
      assertThrows(mtup, [1, {a: 'x'}], 'match.tuple');
      assertThrows(mtup, {}, 'match.tuple');

      const opt = match.optional(match.tuple([match.number, match.string]));

      assert.isTrue(opt.test(null));
      assert.isTrue(opt.test([1, '2']));
      assert.isFalse(opt.test(['1', 2]));

      assertThrows(opt, ['1', 2], 'match.number');
    });

    test("matching", ()=>{
      docProp('string');
      assert.isTrue(match.string.test(''));
      assert.isFalse(match.string.test(1));
      assert.equals(match.string[inspect$](), 'match.string');


      docProp('undefined', 'match undefined');
      assert.isTrue(match.undefined.test());
      assert.isFalse(match.undefined.test(''));
      assert.isFalse(match.undefined.test(null));

      docProp('undefined', 'match null');
      assert.isTrue(match.null.test(null));
      assert.isFalse(match.null.test(''));
      assert.isFalse(match.null.test(undefined));

      docProp('nil', 'match undefined or null');
      assert.isTrue(match.nil.test(null));
      assert.isFalse(match.nil.test(''));
      assert.isTrue(match.nil.test(undefined));

      docProp('date');
      assert.isTrue(match.date.test(new Date));
      assert.isFalse(match.date.test(''));
      assert.isFalse(match.date.test({}));
      assert.isFalse(match.date.test(new Date('invalid')));

      docProp('integer');
      assert.isTrue(match.integer.test(1234));
      assert.isFalse(match.integer.test('1234'));
      assert.isFalse(match.integer.test(1.1));

      docProp('any', 'match anything (or nothing)');
      assert.isTrue(match.any.test());
      assert.isTrue(match.any.test({}));
      assert.isTrue(match.any.test('hello'));

      docProp('func', 'match any function');
      assert.isTrue(match.func.test(function () {}));
      assert.isTrue(match.func.test(()=>{}));
      assert.isFalse(match.func.test({}));
      assert.isFalse(match.func.test('hello'));

      assert.same(match.func.test, match.function.test);

      docProp('object', 'match anything of type `object` except null');
      assert.isTrue(match.object.test({}));
      assert.isTrue(match.object.test(match.string));
      assert.isFalse(match.object.test(null));
      assert.isFalse(match.object.test(function () {}));
      assert.isTrue(match.object.test(new Date));
      assert.isFalse(match.object.test('hello'));

      docProp('baseObject', 'match any object where constructor is Object');
      assert.isTrue(match.baseObject.test({}));
      assert.isFalse(match.baseObject.test(match.string));
      assert.isFalse(match.baseObject.test(null));
      assert.isFalse(match.baseObject.test(function () {}));
      assert.isFalse(match.baseObject.test(new Date));
      assert.isFalse(match.baseObject.test('hello'));

      docProp('match', 'match any matcher');
      assert.isTrue(match.match.test(match.string));
      assert.isTrue(match.match.test(match(function () {})));
      assert.isFalse(match.match.test(null));
      assert.isFalse(match.match.test({}));
    });
  });
});

define(function (require, exports, module) {
  /**
   * The util module provides commonly performed utility functions.
   **/
  const api   = require('koru/test/api');
  const match = require('./match');
  const TH    = require('./test');

  const util  = require('./util');
  var v;

  TH.testCase(module, {
    setUp () {
      v = {};
    },

    tearDown () {
      v = null;
    },

    "test mergeOwnDescriptors"() {
      const a = {a: 1, b: 2};
      const b = util.mergeNoEnum(util.protoCopy(a, {b: 3, c: 4}), {e: 6});

      const c = {d: 5};

      const ans = util.mergeOwnDescriptors(c, b);

      assert.same(ans, c);
      assert.equals(ans, {d: 5, b: 3, c: 4});
      assert.same(ans.e, 6);
    },

    "test toDp"() {
      /**
       * Return a floating point `number` as a string to
       * `dp` decimal places.
       *
       * @param {boolean} zeroFill - pad with zeros.
       **/
      api.method('toDp');
      assert.same(util.toDp(10.7, 0), "11");
      assert.same(util.toDp(2.6, 1), "2.6");
      assert.same(util.toDp(1.2345, 3, true), "1.235");
      assert.same(util.toDp(1.2, 3, true), "1.200");
      assert.same(util.toDp(10, 3), "10");

      api.done();

      assert.same(util.toDp(10.2, 3), "10.2");
      assert.same(util.toDp(1.0021, 3, true), "1.002");
    },

    "test DAY"() {
      const d1 = new Date(2015, 1, 1);
      const d2 = new Date(2015, 1, 2);
      assert.same(util.DAY, +d2 - d1);
    },

    "test pc"() {
      /**
       * Convert a `fraction` into css % string
       **/
      api.method('pc');
      assert.same(util.pc(1.2345678), '123.45678%');
    },

    "test px"() {
      /**
       * Convert a `fraction` into css % string
       **/
      api.method('px');
      assert.same(util.px(123.2345678), '123px');
    },

    "test sansPx"() {
      assert.same(util.sansPx('123.23px'), 123.23);
      assert.same(util.sansPx(), 0);
      assert.same(util.sansPx(234), 234);
    },

    "test indexOfRegex"() {
      const list = [{foo: 'a'}, {foo: 'b'}];
      assert.same(util.indexOfRegex(list, /a/, 'foo'), 0);
      assert.same(util.indexOfRegex(list, /ab/, 'foo'), -1);
      assert.same(util.indexOfRegex(list, /b/, 'foo'), 1);
    },

    "test isObjEmpty"() {
      assert.isTrue(util.isObjEmpty());
      assert.isTrue(util.isObjEmpty({}));
      assert.isFalse(util.isObjEmpty({a: 1}));
    },

    "test keyStartsWith"() {
      assert.isFalse(util.keyStartsWith(null, 'foo'));
      assert.isFalse(util.keyStartsWith({foz: 1, fizz: 2}, 'foo'));
      assert.isTrue(util.keyStartsWith({faz: true, fooz: undefined, fizz: 2}, 'foo'));
      assert.isTrue(util.keyStartsWith({foo: 1, fizz: 2}, 'foo'));
    },

    "test firstParam"() {
      assert.same(util.firstParam({a: 1, b: 2}), 1);
      assert.same(util.firstParam({}), undefined);
      assert.same(util.firstParam(), undefined);
    },

    "test keyMatches"() {
      assert.same(util.keyMatches({ab: 0, bc: 0, de: 0}, /^b(c)/)[1], 'c');
      assert.isFalse(util.keyMatches({ab: 0, bc: 0, de: 0}, /^dee/));
    },

    "test addItem"() {
      const list = ['a', 'b'];

      assert.same(util.addItem(list, 'b'), 1);
      assert.same(util.addItem(list, 'a'), 0);

      assert.equals(list, ['a', 'b']);

      assert.same(util.addItem(list, {aa: 123}), undefined);

      assert.equals(list, ['a', 'b', {aa: 123}]);

      assert.same(util.addItem(list, {aa: 123}), 2);

      assert.equals(list, ['a', 'b', {aa: 123}]);
    },

    "test removeItem"() {
      /**
       * remove an `item` from a `list`. `list` is modified.
       *
       *
       * @param item - can be a key-value object to compare the given keys.
       * @returns {object|primitive} the removed item.
       **/
      api.method('removeItem');
      const foo = [1,2,3];

      assert.same(util.removeItem(foo, 2), 2); assert.equals(foo, [1, 3]);

      assert.same(util.removeItem(foo, 4), undefined); assert.equals(foo, [1, 3]);

      util.removeItem(foo, 1); assert.equals(foo, [3]);

      util.removeItem(foo, 3); assert.equals(foo, []);

      util.removeItem(foo); assert.equals(foo, []);

      const bar = [{id: 4, name: "foo"}, {id: 5, name: "bar"}, {x: 1}];

      assert.same(util.removeItem(bar, {name: 'bar', x: 1}), undefined);
      assert.equals(bar, [{id: 4, name: "foo"}, {id: 5, name: "bar"}, {x: 1}]);


      assert.equals(util.removeItem(bar, {name: 'bar'}), {id: 5, name: "bar"});
      assert.equals(bar, [{id: 4, name: "foo"}, {x: 1}]);

      assert.equals(util.removeItem(bar, {id: 4, name: 'foo'}), {id: 4, name: 'foo'});
      assert.equals(bar, [{x: 1}]);
    },

    "test values"() {
      assert.equals(util.values({a: 1, b: 2}), [1,2]);
    },

    'test intersectp'() {
      /**
       * Determine if `list1` and `list2` intersect
       **/
      api.method('intersectp');
      assert(util.intersectp([1,4],[4,5]));
      refute(util.intersectp([1,2],['a']));
    },

    "test union"() {
      assert.equals(util.union([1,2,3], [3, 4, 5], [3, 6]).sort(), [1, 2, 3, 4, 5, 6]);
      assert.equals(util.union([1,2]), [1, 2]);
      assert.equals(util.union([1,2], null), [1, 2]);
      assert.equals(util.union(null, [1,2]), [1, 2]);
      assert.equals(util.union(null, null), []);
    },

    "test diff"() {
      assert.equals(util.diff(), []);
      assert.equals(util.diff([1, 2]), [1, 2]);

      assert.equals(util.diff([1,"2",3, null], ["2",4]), [1, 3, null]);
    },

    "test symDiff"() {
      assert.equals(util.symDiff(), []);
      assert.equals(util.symDiff([1, 2]), [1, 2]);

      assert.equals(util.symDiff([1,2,3], [2,4]).sort(), [1, 3, 4]);
      assert.equals(util.symDiff([2,4], [1,2,3]).sort(), [1, 3, 4]);
    },

    'test extend'() {
      let item = 5;
      const sub={a: 1, b: 2};
      const sup = {b: 3, get c() {return item;}};

      util.merge(sub,sup);

      item = 6;

      assert.same(sub.a,1);
      assert.same(sub.b,3);
      assert.same(sub.c,6);
    },

    'test mergeExclude'() {
      let item = 5,
          sub={a: 1, b: 2},
          sup = {b: 3, get c() {return item;}, d: 4, e: 5};

      util.mergeExclude(sub,sup, {d: true, e: true});

      item = 6;

      assert.same(sub.a,1);
      assert.same(sub.b,3);
      assert.same(sub.c,6);
    },

    "test mergeInclude"() {
      assert.equals(util.mergeInclude({a: 1, c: 2}, {b: 2, c: 3, d: 4}, {c: true, d: true, z: true}),
                    {a: 1, c: 3, d: 4});
      assert.equals(util.mergeInclude({a: 1, c: 2}, {b: 2, c: 3, d: 4}, ['c', 'd', 'z']),
                    {a: 1, c: 3, d: 4});
    },

    "test extractKeys"() {
      assert.equals(
        util.extractKeys({a: 4, b: "abc", get c() {return {value: true}}}, ['a', 'c', 'e']),
        {a: 4, c: {value: true}}
      );
      assert.equals(
        util.extractKeys({a: 4, b: "abc", get c() {return {value: true}}}, {a: true, c: false, e: null}),
        {a: 4, c: {value: true}}
      );
    },

    "test extractNotKeys"() {
      assert.equals(
        util.extractNotKeys({a: 4, b: "abc", get c() {return {value: true}}}, {a: true, e: true}),
        {b: "abc", c: {value: true}}
      );
    },

    "test splitKeys"() {
      const {include, exclude} = util.splitKeys(
        {a: 4, b: "abc", get c() {return {value: true}}}, {a: true, e: true});

      assert.equals(include, {a: 4});
      assert.equals(exclude, {b: "abc", c: {value: true}});
    },


    "test egal"() {
      assert.same(util.egal, util.is);
      assert.isTrue(util.egal(null, null));
      assert.isTrue(util.egal(NaN, NaN));
      assert.isTrue(util.egal(-0, -0));
      assert.isTrue(util.egal("str", "str"));
      assert.isTrue(util.egal(0, 0));
      assert.isTrue(util.egal(Infinity, Infinity));
      assert.isTrue(util.egal(-Infinity, -Infinity));
      assert.isTrue(util.egal(1, 1));
      assert.isTrue(util.egal(true, true));

      assert.isFalse(util.egal(true, false));
      assert.isFalse(util.egal(null, undefined));
      assert.isFalse(util.egal("", 0));
      assert.isFalse(util.egal(0, -0));
      assert.isFalse(util.egal(Infinity, -Infinity));
      assert.isFalse(util.egal(NaN, 1));
      assert.isFalse(util.egal(1, 2));
      assert.isFalse(util.egal("a", "b"));
    },

    "test shallowEqual arrays"() {
      assert.isTrue(util.shallowEqual([1, 2, 3], [1, 2, 3]));
      assert.isFalse(util.shallowEqual([1, {}, 3], [1, {}, 3]));
      assert.isFalse(util.shallowEqual([1, 2], [1, 2, 3]));
      assert.isFalse(util.shallowEqual([1, 2], [1]));
      assert.isFalse(util.shallowEqual([1, 2], null));
      assert.isFalse(util.shallowEqual('a', [1, 2]));
    },

    "test deepEqual"() {
      assert.isTrue(util.deepEqual(null, null));
      assert.isTrue(util.deepEqual(null, undefined));
      assert.isFalse(util.deepEqual(null, ""));
      assert.isTrue(util.deepEqual({}, {}));
      refute.isTrue(util.deepEqual({}, []));
      assert.isFalse(util.deepEqual(0, -0));
      assert.isFalse(util.deepEqual({a: 0}, {a: -0}));
      assert.isFalse(util.deepEqual({a: null}, {b: null}));

      const matcher = match(function (v) {return v % 2 === 0});
      assert.isTrue(util.deepEqual([1, 2, null], [1, matcher, match.any]));
      assert.isFalse(util.deepEqual([1, 1], [1, matcher]));
      assert.isFalse(util.deepEqual([2, 2], [1, matcher]));

      assert.isTrue(util.deepEqual({a: 1, b: {c: 1, d: [1, {e: [false]}]}},
                                   {a: 1, b: {c: 1, d: [1, {e: [false]}]}}));

      assert.isFalse(util.deepEqual({a: 1, b: {c: 1, d: [1, {e: [false]}]}},
                                    {a: 1, b: {c: 1, d: [1, {e: [true]}]}}));
      assert.isFalse(util.deepEqual({a: 1, b: {c: -0, d: [1, {e: [false]}]}},
                                    {a: 1, b: {c: 0, d: [1, {e: [false]}]}}));

      assert.isFalse(util.deepEqual({a: 1, b: {c: 1, d: [1, {e: [false]}]}},
                                    {a: 1, b: {c: 1, d: [1, {e: [false], f: null}]}}));

      assert.isTrue(util.deepEqual({a: 1, b: undefined}, {a: 1}));

      assert.isFalse(util.deepEqual({a: 1}, {a: "1"}));

      assert.exception(_=> {
        const a = {}, b = {};
        a.a = a; b.a = b;
        assert.isFalse(util.deepEqual(a, b));
      }, {message: 'deepEqual maxLevel exceeded'});
    },

    "test elemMatch"() {
      /**
       * true if all keys in a are deepEqual to the corresponding keys in b
       **/

      assert.isTrue(util.elemMatch({}, {}));
      assert.isTrue(util.elemMatch(0, 0));
      assert.isTrue(util.elemMatch(1, 1));
      assert.isFalse(util.elemMatch(1, 2));
      assert.isTrue(util.elemMatch(null, null));

      assert.isTrue(util.elemMatch({a: {b: 1}}, {a: {b: 1}, c: 3}));

      assert.isFalse(util.elemMatch({a: {b: 1}}, {a: {b: 1, c: 3}}));
    },

    "test invert"() {
      assert.equals(util.invert({a: 1, b: 2}), {'1': "a", '2': "b"});
      assert.equals(util.invert({a: 1, b: 2}, x => x+x), {'1': "aa", '2': "bb"});
    },

    "test lookupDottedValue"() {
      assert.same(util.lookupDottedValue("foo.1.bar.baz", {
        a: 1, foo: [{}, {bar: {baz: "fnord"}}]}), "fnord");
      assert.same(util.lookupDottedValue(['foo', 1, 'bar', 'baz'], {
        a: 1, foo: [{}, {bar: {baz: "fnord"}}]}), "fnord");
    },

    "test includesAttributes"() {
      const changes = {b: '2'};
      const doc = {a: '1', b: '3'};

      assert.isTrue(util.includesAttributes({a: 1}, changes, doc, null));
      assert.isTrue(util.includesAttributes({a: 1, b: '2'}, changes, doc, null));
      assert.isFalse(util.includesAttributes({a: 1, b: '3'}, changes, doc, null));
      assert.isFalse(util.includesAttributes({a: 2, b: '2'}, changes, doc, null));
    },

    "test regexEscape"() {
      assert.same(util.regexEscape('ab[12]\\w.*?\\b()'), 'ab\\[12\\]\\\\w\\.\\*\\?\\\\b\\(\\)');
    },

    "test newEscRegex"() {
      assert.match('ab[12]\\w.*?\\b()', util.newEscRegex('ab[12]\\w.*?\\b()'));
    },

    "test pick"() {
      assert.equals(util.pick(), {});
      assert.equals(util.pick({a: 1, b: 2, c: 3}, 'a', 'c'), {a:1, c: 3});
    },

    "test mapToSearchStr"() {
      assert.same(util.mapToSearchStr({'a +b': 'q[a]', foo: 'bar'}), "a%20%2Bb=q%5Ba%5D&foo=bar");
    },

    "test encodeURIComponent"() {
      assert.same(util.encodeURIComponent(0), '0');
      assert.same(util.encodeURIComponent(), '');
      assert.same(util.encodeURIComponent(null), '');

      assert.same(util.encodeURIComponent("'!@#$%^&*()_hello world"),
                  '%27%21%40%23%24%25%5E%26%2A%28%29_hello%20world');
    },

    "test decodeURIComponent"() {
      assert.same(util.decodeURIComponent(''), null);
      assert.same(util.decodeURIComponent(
        '%27%21%40%23%24%25%5E%26%2A%28%29_hello%20world+again'), "'!@#$%^&*()_hello world again");
    },

    "test searchStrToMap"() {
      assert.equals(util.searchStrToMap("a%20%2Bb=q%5Ba%5D&foo=bar"), {'a +b': 'q[a]', foo: 'bar'});
      assert.equals(util.searchStrToMap(null), {});

    },

    "test forEach"() {
      util.forEach(null, v.stub = this.stub());
      refute.called(v.stub);
      const results = [];
      util.forEach(v.list = [1,2,3], function (val, index) {
        results.push(val+"."+index);
      });

      assert.equals(results, ['1.0', '2.1', '3.2']);
    },

    "test reverseForEach"() {
      /**
       * Visit `list` in reverse order.
       *
       * @param visitor - called with the list `item` and `index`
       **/
      api.method('reverseForEach');
      api.example(() => {
        const results = [];
        util.reverseForEach(v.list = [1,2,3], (val, index) => {
          results.push(val+"."+index);
        });
        assert.equals(results, ['3.2', '2.1', '1.0']);

        // ignores null list
        util.reverseForEach(null, v.stub = this.stub());
        refute.called(v.stub);
      });
    },


    "test append"() {
      const list1 = [1, 2, 3];

      assert.same(util.append(list1, [4, 3]), list1);
      assert.equals(list1, [1, 2, 3, 4, 3]);

      const args = testArgs(1, 2);

      util.append(args, [4, 5]);

      assert.same(args[3], 5);

      function testArgs() {
        return arguments;
      }
    },

    "test toMap"() {
      assert.equals(util.toMap(), {});
      assert.equals(util.toMap(null), {});
      assert.equals(util.toMap(['a', 'b']), {a: true, b: true});
      assert.equals(util.toMap('foo', true, [{foo: 'a'}, {foo: 'b'}]),
                    {a: true, b: true});
      assert.equals(util.toMap('foo', null, [{foo: 'a'}, {foo: 'b'}]),
                    {a: {foo: 'a'}, b: {foo: 'b'}});
      assert.equals(util.toMap('foo', null, [{foo: 'a'}], [{foo: 'b'}]),
                    {a: {foo: 'a'}, b: {foo: 'b'}});
      assert.equals(util.toMap('foo', 'baz', [{foo: 'a', baz: 1},
                                              {foo: 'b', baz: 2}]), {a: 1, b: 2});
      assert.equals(util.toMap(0, 1, [['foo', 'bar'], ['a', 1]]),
                    {foo: "bar", a: 1});
      assert.equals(util.toMap(1, 0, [['foo', 'bar'], ['a', 1]]),
                    {1: "a", bar: "foo"});
      assert.equals(util.toMap('foo', (c, i) => c.foo+i, [{foo: 'a'}, {foo: 'b'}]),
                    {a: "a0", b: "b1"});
    },

    "test mapLinkedList"() {
      const a = {foo: 1, next: {foo: 2, next: null}};
      assert.equals(util.mapLinkedList(a, n => n.foo), [1, 2]);
    },

    "test mapField"() {
      assert.same(util.mapField(null), null);

      assert.equals(util.mapField([]), []);
      assert.equals(util.mapField([{_id: 1}, {_id: 2}]), [1, 2]);
      assert.equals(util.mapField([{foo: 2, bar: 4}, {foo: "ab"}], 'foo'), [2, "ab"]);
    },

    "test idNameListToMap"() {
      assert.equals(util.idNameListToMap([['a', 'a a'], ['b', 'b b']]), {a: "a a", b: "b b"});
    },

    "test find "() {
      assert.same(util.find([1,8,7,3], function (value, idx) {
        return value > 5 && idx === 2;
      }), 7);

      assert.same(util.find([1,8,7,3], function (value, idx) {
        return false;
      }), undefined);
    },

    "test binarySearch"() {

      assert.same(util.binarySearch([], row => assert(false)), -1);

      const list = [1,3,6,8,10,13,15];
      assert.same(util.binarySearch([1,2,3], row => -1, 0), -1);
      assert.same(util.binarySearch(list, row => 0 - row), -1);
      assert.same(util.binarySearch(list, row => 16 - row), -1);
      assert.same(util.binarySearch(list, row => 5 - row), 1);
      assert.same(util.binarySearch(list, row => 6 - row, 0), 2);
      assert.same(util.binarySearch(list, row => 10 - row), 4);
      assert.same(util.binarySearch(list, row => 14 - row), 5);

      assert.same(util.binarySearch(list, row => 8 - row, -1), 3);
      assert.same(util.binarySearch(list, row => 8 - row, 7), 3);
    },

    "test flatten"() {
      assert.equals(util.flatten([1, [2, 6, [4]], [], 7, 8]), [1, 2, 6, 4, 7, 8]);
      assert.equals(util.flatten([1, [2, 6, [4]], [], 7, 8], true), [1, 2, 6, [4], 7, 8]);
    },

    "test findBy"() {
      const list = [{foo: 'a', _id: 2}, {foo: 'b', _id: 1}];
      assert.same(util.findBy(list, 1), list[1]);
      assert.same(util.findBy(list, 2), list[0]);
      assert.same(util.findBy(list, 'a', 'foo'), list[0]);
      assert.same(util.findBy(list, 'b', 'foo'), list[1]);
    },

    "test indexOf "() {
      const data = [{_id: 1, age: 20}, {_id: 2, age: 30}];

      // default field (_id)
      assert.same(util.indexOf(data, 1), 0);
      assert.same(util.indexOf(data, 2), 1);
      assert.same(util.indexOf(data, 3), -1);

      // explicit field (age)
      assert.same(util.indexOf(data, 30, 'age'), 1);
      assert.same(util.indexOf(data, 20, 'age'), 0);
      assert.same(util.indexOf(data, 3, 'age'), -1);
    },

    "test protoCopy"() {
      const source = {a: new Date(), b: "two"};

      const dest = util.protoCopy(source, {get c() {return "cc"}});
      assert.same(dest.a, source.a);
      assert.same(dest.b, "two");
      assert.same(dest.c, "cc");
      assert.same(source.c, undefined);

      dest.b = 'bb';
      assert.same(source.b, "two");

      source.a = 'aa';
      assert.same(dest.a, 'aa');
    },

    "test shallowCopy"() {
      assert.same(util.shallowCopy(1), 1);
      assert.same(util.shallowCopy(true), true);
      assert.same(util.shallowCopy(null), null);
      assert.same(util.shallowCopy(undefined), undefined);
      assert.same(util.shallowCopy("a"), "a");

      /** sparse array **/
      const ans = util.shallowCopy([1,2,,,3]);
      assert.equals(ans.map((d, i) => `${d}:${i}`), ['1:0', '2:1', , , '3:4']);

      function func() {}
      assert.same(util.shallowCopy(func), func);

      /** Complex object */
      const X = Object.create({xx() {return 4}});
      X.yy = a => 2*a;

      let Xcopy = util.shallowCopy(X);
      assert.same(Xcopy.xx(), 4);
      assert.same(Xcopy.yy(3), 6);
      assert.same(Object.getPrototypeOf(Xcopy).xx(), 4);

      /** Date */
      let orig = new Date(123);
      assert.equals(util.shallowCopy(orig), orig);
      refute.same(util.shallowCopy(orig), orig);


      orig = [1, "2", {three: [4, {five: 6}]}];

      const result = util.shallowCopy(orig);

      assert.equals(orig, result);

      result[2].three = 'changed';

      assert.equals(orig, [1, "2", {three: 'changed'}]);
    },

    "test deepCopy"() {
      assert.same(util.deepCopy(1), 1);
      assert.same(util.deepCopy(true), true);
      assert.same(util.deepCopy(null), null);
      assert.same(util.deepCopy(undefined), undefined);
      assert.same(util.deepCopy("a"), "a");

      const u8 = new Uint8Array([1, 2, 3]);
      const u8c = util.deepCopy(u8);
      refute.same(u8, u8c);
      assert.same(u8c.byteLength, 3);

      assert.same(u8c[0], 1);
      assert.same(u8c[1], 2);
      assert.same(u8c[2], 3);

      /** sparse array **/
      const ans = util.deepCopy([1,2,,, v.ab = ['a','b']]);
      refute.same(ans[5], v.ab);
      assert.equals(ans.map((d, i) => `${util.inspect(d)}:${i}`),
                    ['1:0', '2:1', , , `['a', 'b']:4`]);

      function func() {}
      assert.same(util.deepCopy(func), func);

      let orig = new Date(123);
      assert.equals(util.deepCopy(orig), orig);
      refute.same(util.deepCopy(orig), orig);


      orig = [1, "2", {three: [4, {five: 6}]}];

      const result = util.deepCopy(orig);

      assert.equals(orig, result);

      result[2].three[1].five = 'changed';

      assert.equals(orig, [1, "2", {three: [4, {five: 6}]}]);

      assert.msg("should handle sparse arrays").equals(util.deepCopy([1,2,,3]), [1,2,,3]);

      assert.exception(_=> {
        const a = {};
        a.a = a;
        util.deepCopy(a);
      }, {message: 'deepCopy maxLevel exceeded'});

    },

    "test camelize"() {
      assert.same(util.camelize(""), "");
      assert.same(util.camelize("abc"), "abc");
      assert.same(util.camelize("abc-def_xyz.qqq+foo%bar"), "abcDefXyzQqqFooBar");
      assert.same(util.camelize("CarlySimon"), "CarlySimon");
    },

    "test niceFilename"() {
      assert.same(util.niceFilename("a1!@#$%/sdffsdDDfdsf/fds.txt"), 'a1-sdffsdddfdsf-fds-txt');
    },

    "test titleize"() {
      assert.same(util.titleize(""), "");
      assert.same(util.titleize("abc"), "Abc");
      assert.same(util.titleize("abc-def_xyz.qqq+foo%bar"), "Abc Def Xyz Qqq Foo Bar");
      assert.same(util.titleize("CarlySimon"), "Carly Simon");
    },

    "test humanize"() {
      assert.same(util.humanize('camelCaseCamel_id'), "camel case camel");
      assert.same(util.humanize('Hyphens-and_underscores'), "hyphens and underscores");
    },

    "test pluralize"() {
      assert.same(util.pluralize('day', 1), 'day');
      assert.same(util.pluralize('day', 2), 'days');
    },

    "test initials"() {
      assert.same(util.initials(null, 2), "");
      assert.same(util.initials("Sam THE BIG Man", 2), "SM");
      assert.same(util.initials("Sam the BIG man"), "STM");
      assert.same(util.initials("Prince"), "P");
      assert.same(util.initials("Princetui", 3, 'abrv'), "PRN");
    },

    "test hashToCss"() {
      assert.same(util.hashToCss({foo: 1, bar: "two"}), "foo:1;bar:two");

    },

    "test compare"() {
      /**
       * uses en-US collating
       **/
      assert.isTrue(util.compare("albert", "Beatrix") < 0);
      assert.isTrue(util.compare("Albert", "beatrix") < 0);
      assert.isTrue(util.compare("Albert", "albert") > 0);
      assert.isTrue(util.compare("Albert", "Albert") == 0);
    },

    "test compareByName"() {
      assert.equals(util.compareByName.compareKeys, ['name', '_id']);

      const a = {name: "Bob"};
      const b = {name: "Bob"};

      assert.same(util.compareByName(a,b), 0);
      b._id = 'Abc';
      assert.same(util.compareByName(a,b), -1);
      a._id = 'zbc';
      assert.same(util.compareByName(a,b), 1);
      a._id = 'Abc';
      assert.same(util.compareByName(a,b), 0);

      b.name = 'Cary';
      assert.same(util.compareByName(a,b), -1);

      b.name = 'Arnold';
      assert.same(util.compareByName(a,b), 1);

      b.name = 'arnold';
      assert.same(util.compareByName(a,b), 1);

      assert.same(util.compareByName(null, b), -1);
      assert.same(util.compareByName(b, null), 1);
      assert.same(util.compareByName(undefined, null), 0);

    },

    "test compareByOrder"() {
      assert.equals(util.compareByOrder.compareKeys, ['order', '_id']);
      const a = {order: 300};
      const b = {order: 300};

      assert.same(util.compareByOrder(a,b), 0);
      b._id = 'Abc';
      assert.same(util.compareByName(a,b), -1);
      a._id = 'zbc';
      assert.same(util.compareByName(a,b), 1);
      a._id = 'Abc';
      assert.same(util.compareByName(a,b), 0);

      b.order = 400;
      assert.same(util.compareByOrder(a,b), -1);

      b.order = 200;
      assert.same(util.compareByOrder(a,b), 1);

      assert.same(util.compareByOrder(null, b), -1);
      assert.same(util.compareByOrder(b, null), 1);
      assert.same(util.compareByOrder(undefined, null), 0);
    },

    "test compareByField"() {
      const a = {f1: "Bob", f2: 1, foo_id: 'Xbc'};
      const b = {f1: "Bob", f2: 2, foo_id: 'cbc'};

      assert.same(util.compareByField('foo_id')(a,b), -1);

      assert.equals(util.compareByField('_id').compareKeys, ['_id']);

      const f1 = util.compareByField('f1');
      assert.equals(f1.compareKeys, ['f1', '_id']);

      assert.same(f1(a,b), 0);

      b._id = 'Abc';
      assert.same(f1(a,b), -1);
      a._id = 'zbc';
      assert.same(f1(a,b), 1);
      a._id = 'Abc';
      assert.same(f1(a,b), 0);

      b.f1 = 'Cary';
      assert.same(util.compareByField('f1')(a,b), -1);
      assert.same(util.compareByField('f1', -1)(a,b), 1);

      b.f1 = 'arnold';
      assert.same(util.compareByField('f1')(a,b), 1);
      assert.same(util.compareByField('f2')(a,b), -1);
      assert.same(util.compareByField('f2')(b,a), 1);


      assert.same(util.compareByField('f2')(null,a), -1);
      assert.same(util.compareByField('f2')(a, null), 1);
      assert.same(util.compareByField('f2')(null, undefined), -1);

      b.f2 = "2"; // string less than number
      assert.same(util.compareByField('f2')(a,b), 1);
      assert.same(util.compareByField('f2')(b,a), -1);

      // using symbol for key
      const sym = Symbol();
      a[sym] = "G"; b[sym] = "c";
      const compare = util.compareByField(sym);
      assert.same(compare(a,b), -1);
      assert.same(compare(b,a), 1);
      assert.same(compare(b,{[sym]: 'c'}), 0);
      assert.equals(compare.compareKeys, [sym]);
    },

    "test compareByFields"() {
      const a = {f1: "bob", f2: 1, foo_id: 'Xbc'};
      const b = {f1: "bob", f2: 2, foo_id: 'cbc'};

      assert.same(util.compareByFields('foo_id', -1)(a,b), 1);
      assert.same(util.compareByFields('f2', 'f1')(a,b), -2);
      assert.same(util.compareByFields('f1')(a,b), 0);
      assert.same(util.compareByFields('f2')(a,b), -2);
      assert.same(util.compareByFields('f1', 'f2')(a,b), -2);
      assert.same(util.compareByFields('f1', 'f2', -1)(a,b), 2);
      assert.equals(util.compareByFields('f1', 'f2', -1).compareKeys, ['f1', 'f2', '_id']);
      assert.equals(util.compareByFields('f1', '_id', -1).compareKeys, ['f1', '_id']);

      assert.same(util.compareByFields('f1', 'f2')({f1: 'Bab'}, a), -2);
      assert.same(util.compareByFields('f1', 'f2')(a, a), 0);

      b.f1 = 'Cary';
      assert.same(util.compareByFields('f1', 1)(a,b), -2);
      assert.same(util.compareByFields('f1', -1)(a,b), 2);

      a.f1 = 'Cary';
      const f1 = util.compareByFields('f1', -1);

      assert.same(f1(a, b), 0);

      b._id = 'Abc';
      assert.same(f1(a,b), -1);
      a._id = 'zbc';
      assert.same(f1(a,b), 1);
      a._id = 'Abc';
      assert.same(f1(a,b), 0);

      // using symbol for key
      const sym = Symbol();
      a[sym] = "G"; b[sym] = "c";
      const compare = util.compareByFields('f1', sym);
      assert.same(compare(a,b), -1);
      assert.same(compare(b,a), 1);
      a.f1 = 'Zord';
      assert.same(compare(b,a), -2);
      assert.same(compare(b,{f1: b.f1, [sym]: 'c'}), 0);
      assert.equals(compare.compareKeys, ['f1', sym]);
    },

    "test colorToArray"() {
      assert.equals(util.colorToArray(''), '');
      assert.equals(util.colorToArray([1,2,3,0.5]), [1,2,3,0.5]);
      assert.equals(util.colorToArray("#ac3d4f"), [172, 61, 79, 1]);
      assert.equals(util.colorToArray("#d4faf480"), [212, 250, 244, 0.5]);

      assert.equals(util.colorToArray("rgb(212, 250,244, 0.2)"), [212, 250, 244, 0.2]);
      assert.equals(util.colorToArray("rgba(212, 150,244, 0.8)"), [212, 150, 244, 0.8]);

      assert.equals(util.colorToArray("#ac3"), [170, 204, 51, 1]);
    },

    "nestedHash": {
      "test setNestedHash"() {
        const hash = {};

        util.setNestedHash(123, hash, 'a', 'b');
        assert.same(util.setNestedHash(456, hash, 'a', 'c'), 456);

        assert.equals(hash, {a: {b: 123, c: 456}});
      },

      "test getNestedHash"() {
        const hash = {a: {b: 123, c: 456}};

        assert.equals(util.getNestedHash(hash, 'a', 'b'), 123);
        assert.equals(util.getNestedHash(hash, 'a'), {b: 123, c: 456});
        assert.equals(util.getNestedHash(hash, 'b'), undefined);
        assert.equals(util.getNestedHash(hash, 'a', 'd'), undefined);
      },

      "test deleteNestedHash"() {
        let hash = {a: {b: 123, c: 456}};

        assert.equals(util.deleteNestedHash(hash, 'a', 'b'), 123);
        assert.equals(util.deleteNestedHash(hash, 'a'), {c: 456});
        assert.equals(hash, {});

        hash = {a: {c: {d: 456}}};

        assert.equals(util.deleteNestedHash(hash, 'a', 'c', 'd'), 456);

        assert.equals(hash, {});

        hash = {a: {b: 123, c: {d: 456}}};

        assert.equals(util.deleteNestedHash(hash, 'a', 'c', 'd'), 456);

        assert.equals(hash, {a: {b: 123}});
      },
    },

    'test reverseMerge'() {
      let item = 5;
      const sub={a: 1, b: 2};
      const sup = {d: 'd', b: 3, get c() {return item;}};

      util.reverseMerge(sub,sup, {d: 1});

      item = 6;

      assert.same(sub.a,1);
      assert.same(sub.b,2);
      assert.same(sub.c,6);
      refute('d' in sub);
    },

    "test adjustTime"() {
      this.stub(Date, 'now').returns(12345);
      this.onEnd(_=>{util.adjustTime(-util.timeAdjust)});
      assert.same(util.timeAdjust, 0);
      assert.same(util.timeUncertainty, 0);

      assert.same(util.dateNow(), 12345);

      util.adjustTime(4, 3);

      assert.same(util.timeUncertainty, 3);
      assert.same(util.dateNow(), 12349);

      util.adjustTime(-1);

      assert.same(util.timeUncertainty, 0);
      assert.same(util.dateNow(), 12348);
    },

    "test withDateNow"() {
      const date = new Date("2013-06-09T23:10:36.855Z");
      const result = util.withDateNow(date, function () {
        assert.equals(util.newDate(), date);
        assert.equals(util.dateNow(), +date);
        assert.same(util.withDateNow(+date + 123, function () {
          assert.equals(util.newDate(), new Date(+date + 123));
          assert.equals(util.dateNow(), +date + 123);

          if (isServer) {
            const Fiber = requirejs.nodeRequire('fibers');
            assert.same(util.thread, Fiber.current.appThread);
          }
          assert.equals(util.thread.dates, [undefined, 1370819436855]);
          return 987;
        }), 987);

        assert.equals(util.newDate(), date);
        assert.equals(util.dateNow(), +date);
        return true;
      });

      const before = util.dateNow();
      const now = Date.now();
      const after = util.dateNow();

      assert.between(now, before, after);

      assert.isTrue(result);
    },

    "test dateInputFormat"() {
      assert.same(util.dateInputFormat(new Date(2015, 0, 15)), "2015-01-15");
    },

    "test yyyymmddToDate"() {
      assert.equals(util.yyyymmddToDate(' 2015-5-04  '), new Date(2015, 4, 4));
      assert.equals(util.yyyymmddToDate('1969 04 09'), new Date(1969, 3, 9));
      assert.equals(util.yyyymmddToDate('1999-12-31'), new Date(1999, 11, 31));
      assert.equals(util.yyyymmddToDate('2011/02/6'), new Date(2011, 1, 6));
      assert.equals(util.yyyymmddToDate('2011-02/6'), undefined);
      assert.equals(util.yyyymmddToDate('2011/11/32'), undefined);
      assert.equals(util.yyyymmddToDate('2011/13/3'), undefined);
    },

    "test twoDigits"() {
      assert.same(util.twoDigits(9), '09');
      assert.same(util.twoDigits(10), '10');
    },

    "test emailAddress"() {
      assert.same(util.emailAddress('a@xyz.co', 'f<o>o <b<a>r>'), 'foo bar <a@xyz.co>');
    },

    "test extractFromEmail"() {
      assert.equals(util.extractFromEmail("abc@Def.Co"), {
        email: "abc@def.co",
        name: "Abc",
      });

      assert.equals(util.extractFromEmail("abc-def_xyz.qqq@vimaly.com"), {
        email: "abc-def_xyz.qqq@vimaly.com",
        name: "Abc Def Xyz Qqq",
      });

      assert.equals(util.extractFromEmail("helenReddy@Delta.dawn.co"), {
        email: "helenreddy@delta.dawn.co",
        name: "Helen Reddy",
      });

      assert.equals(util.extractFromEmail("Nick Nolte <helenReddy@Delta.dawn.co>"), {
        email: "helenreddy@delta.dawn.co",
        name: "Nick Nolte",
      });
    },

    "test compareVersion"() {
      assert.same(util.compareVersion('v1.0.0', 'v1.0.0'), 0);

      // simple string compare
      assert.same(util.compareVersion('xv1.0.10', 'xv1.0.9'), -1);

      // only /^v(\d+\.)*(?:-(\d+))?(.*)$/ is special
      assert.same(util.compareVersion('v1.0.10', 'v1.0.9'), 1);
      assert.same(util.compareVersion('v1.0.9', 'v1.0.10'), -1);
      assert.same(util.compareVersion('v1.0', 'v1'), 0);
      assert.same(util.compareVersion('v1', 'v1.0'), 0);
      assert.same(util.compareVersion('v1.10.0', 'v1.9.0'), 1);
      assert.same(util.compareVersion('v1.9.0', 'v1.10.0'), -1);

      assert.same(util.compareVersion('v1.0.0-36', 'v1.0.0-4'), 1);
      assert.same(util.compareVersion('v1.0.0-36', 'v1.0.0-40'), -1);
      assert.same(util.compareVersion('v1.0.0-36-2', 'v1.0.0-36-12'), 1);
    },


    "test parseEmailAddresses"() {
      assert.isNull(util.parseEmailAddresses("foo@bar baz"));
      assert.isNull(util.parseEmailAddresses("foo@ba_r.com"));


      assert.equals(util.parseEmailAddresses("foo@bar.baz.com fnord"),
                    {addresses: ["foo@bar.baz.com"], remainder: "fnord"});

      assert.equals(
        util.parseEmailAddresses("a b c <abc@def.com> foo-_+%bar@vimaly-test.com, "),
        {addresses: ["a b c <abc@def.com>", "foo-_+%bar@vimaly-test.com"], remainder: "" });
    },

    "test asyncToGenerator"(done) {
      const foo = function (val) {
        return new Promise(r => setTimeout(() => {r(val+30)}, 0));
      };
      const bar = util.asyncToGenerator(function*(val) {
        const ans = (yield foo(val+5)) + (yield foo(13));
        try {
          assert.same(ans, 83);
          done();
        } catch(ex) {
          done(ex);
        }
      });

      bar(5);
    },

    "test error asyncToGenerator"(done) {
      const foo = function (val) {
        return new Promise((r, e) => setTimeout(() => {
          val === 13 ? e(new Error("13")) : r(val+30);
        }, 0));
      };
      const bar = util.asyncToGenerator(function*(val) {
        try {
          const ans = (yield foo(10)) + (yield foo(13));
          assert(false, "should throw error 13");
        } catch(ex) {
          if (ex.message === '13') {
            assert(true);
            done();
          } else
            done(ex);
        }
      });

      bar(12);
    },
  });
});

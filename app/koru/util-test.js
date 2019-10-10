define((require, exports, module)=>{
  'use strict';
  /**
   * The `util` module provides commonly performed utility functions.
   **/
  const Random = require('koru/random');
  const api    = require('koru/test/api');
  const match  = require('./match');
  const TH     = require('koru/test-helper');

  const {stub, spy, match: m} = TH;

  const util  = require('./util');

  let v = {};
  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    before(()=>{
      api.module({subjectName: 'util'});
    });

    afterEach( ()=>{
      v = {};
    });

    test("setProperty", ()=>{
      /**
       * Set a property descriptor for an object. By default the descriptor options will be:
       * `writable`, `enumerable` and `configurable`.
       *
       * @param object The object to define the property on

       * @param name the name of the new alias
       * @param descriptor the descriptor to define on `object`

       * @returns the old descriptor if the property already existed
       **/

      //[
      const book = {
        get pages() {return this.pageCount},
        set pages(v) {this.pageCount = v},
      };

      let old;
      old = util.setProperty(book, 'name', {value: 'Juggling mandarins'});
      assert.same(old, undefined);

      assert.equals(Object.getOwnPropertyDescriptor(book, 'name'), {
        value: 'Juggling mandarins', writable: true, enumerable: true, configurable: true,
      });

      old = util.setProperty(book, 'pages', {get: ()=> 123});
      assert.equals(old, {get: m.func, set: m.func, enumerable: true, configurable: true});
      assert.same(old.get.call({pageCount: 2}), 2);

      assert.equals(Object.getOwnPropertyDescriptor(book, 'pages'), {
        get: m.func, set: m.func, enumerable: true, configurable: true,
      });
      book.pages = 4;
      assert.same(book.pages, 123);
      //]
    });

    test("defineAlias", ()=>{
      /**
       * Alias a property descriptor of an object
       *
       * @param object The object to define the alias on

       * @param newAlias the name of the new alias
       * @param existing the name of the existing descriptor
       **/

      //[
      const book = {
        name: 'Juggling mandarins',
        get pages() {return this.pageCount},
        set pages(v) {this.pageCount = v},
      };

      util.defineAlias(book, 'title', 'name');
      assert.same(book.title, 'Juggling mandarins');

      util.defineAlias(book, 'size', 'pages');
      book.pages = 300;
      assert.same(book.size, 300);
      book.size = 400;
      assert.same(book.pages, 400);
      assert.same(book.size, 400);
      //]
    });

    test("localeCompare", ()=>{
      /**
       * Order strings according to the client's locale (case insensitive, numeric aware) then by a
       * simple comparison. Zero is only returned for exact matches.
       *
       * @return 0 if exact match otherwise -1 if `a` compomes before `b`; else 1
       **/

      assert.same(util.localeCompare("a", "a"), 0);
      assert.same(util.localeCompare("ab", "àc"), -1);
      assert.same(util.localeCompare("ac", "àb"), 1);

      assert.same(util.localeCompare("AB", "ac"), -1);
      assert.same(util.localeCompare("ab", "AC"), -1);

      assert.same(util.localeCompare("2. abc", "10 abc"), -1);
      assert.same(util.localeCompare("10. abc", "2 abc"), 1);
    });

    test("mergeOwnDescriptors", ()=>{
      /**
       * Merge `source` into `dest`, including non-enumerable properties from `source`. That is, add
       * each property in `source`, including non-enumerable properties, to `dest`, or where a property
       * of that name already exists in `dest`, replace the property in `dest` with the property from
       * `source`. Return the modified `dest`.
       * @param dest an object to modify
       * @param source the properties to be added or modified
       *
       * @returns `dest` modified: each property in `source`, including non-enumerable properties,
       * has been added to `dest`, or where a property of that name already existed in `dest`, the
       * property in `dest` has been replaced with the property from `source`
       **/
      api.method();
      //[
      const a = {a: 1, b: 2};
      const b = util.mergeNoEnum({__proto__:a, b: 3, c: 4}, {e: 6});
      const c = {d: 5};

      const ans = util.mergeOwnDescriptors(c, b);

      assert.same(ans, c);
      assert.equals(ans, {d: 5, b: 3, c: 4});
      assert.same(ans.e, 6);
      //]
    });

    test("toDp", ()=>{
      /**
       * Return `number` to `dp` decimal places, converted to a string, padded with
       * zeros if `zeroFill` is `true`.
       * @param number a number to be converted
       * @param dp the number of decimal places to display `number` to
       * @param zeroFill pad with zeros; `false` by default
       *
       * @returns `number` to `dp` decimal places, converted to a string, padded with
       * zeros if `zeroFill` is `true`
       **/
      api.method('toDp');
      //[
      assert.same(util.toDp(10.7, 0), "11");
      assert.same(util.toDp(2.6, 1), "2.6");
      assert.same(util.toDp(1.2345, 3, true), "1.235");
      assert.same(util.toDp(1.2, 3, true), "1.200");
      assert.same(util.toDp(10, 3), "10");
      //]

      assert.same(util.toDp(10.2, 3), "10.2");
      assert.same(util.toDp(1.0021, 3, true), "1.002");
    });

    test("DAY", ()=>{
      api.property('DAY', {info: 'The number of milliseconds in a day.'});
      const d1 = new Date(2015, 1, 1);
      const d2 = new Date(2015, 1, 2);
      assert.same(util.DAY, +d2 - d1);
    });

    test("pc", ()=>{
      /**
       * Return a string comprised of the percent form of `fraction`, with the percent symbol, %.
       * @param fraction a fraction
       *
       * @returns a string comprised of the percent form of `fraction`, with the percent symbol, %
       **/
      api.method('pc');
      assert.same(util.pc(1.2345678), '123.45678%');
    });

    test("sansPx", ()=>{
      /**
       * Return `value` converted to a number; the suffix 'px' is removed.
       * @param value a value to be converted
       *
       * @returns `value` converted to a number; the suffix 'px' has been removed
       **/
      api.method('sansPx');
      assert.same(util.sansPx('123.23px'), 123.23);
      assert.same(util.sansPx(), 0);
      assert.same(util.sansPx(234), 234);
    });

    test("sansPc", ()=>{
      /**
       * Return `value` converted to a number; the suffix '%' is removed.
       * @param value a value to be converted
       *
       * @returns `value` converted to a number; the suffix '%' has been removed
       **/
      api.method('sansPc');
      assert.same(util.sansPc('123.23%'), 123.23);
      assert.same(util.sansPc(), 0);
      assert.same(util.sansPc(234), 234);
    });

    test("diffString", ()=>{
      /**
       * Find the difference between `oldstr` and `newstr`. Return `undefined` if `oldstr` and
       * `newstr` are the same; otherwise return an array of three numbers:

       * 1. the index of the first non-matching character in oldstr and newstr

       * 1. the length of the segment of `oldstr` that doesn't match `newstr`

       * 1. the length of the segment of `newstr` that doesn't match `oldstr`

       * @param oldstr a string

       * @param newstr another string

       * @returns {undefined|Array} `undefined` if `oldstr` and `newstr` are the same, otherwise an
       * array of three numbers:

       * 1. the index of the first non-matching character in oldstr and newstr
       * 1. the length of the segment of `oldstr` that doesn't match `newstr`
       * 1. the length of the segment of `newstr` that doesn't match `oldstr`
       **/
      api.method('diffString');
      //[
      assert.equals(util.diffString("it1", "it21"), [2, 0, 1]);
      assert.equals(util.diffString("it1", "zit21z"), [0, 3, 6]);
      assert.equals(util.diffString("it21", "it1"), [2, 1, 0]);
      assert.equals(util.diffString("cl 123.2", "cl 123"), [6, 2, 0]);
      assert.equals(util.diffString("h💣el💣 world", "h💣elo wor💣ld"), [5, 6, 7]);
      assert.equals(util.diffString("h💣el💣 world", "h💣el💤 wor💣ld"), [5, 6, 8]);
      assert.equals(util.diffString("helo worlld", "hello world"), [3, 6, 6]);
      assert.equals(util.diffString("hello world", "helo worlld"), [3, 6, 6]);
      assert.equals(util.diffString("hello world", "hello world"), undefined);
      //]
    });

    test("diffStringLength", ()=>{
      /**
       * In the longer of `oldstr` and `newstr`, find the length of the segment that doesn't
       * match the other string.
       * @param oldstr a string
       * @param newstr another string
       *
       * @returns `0` if `oldstr` and `newstr` are the same, otherwise the length of the segment,
       * in the longer of `oldstr` and `newstr`, that doesn't match the other string
       **/
      api.method('diffStringLength');
      assert.equals(util.diffStringLength("h💣elo wor💣ld", "h💣el💣 world"), 7);
      assert.equals(util.diffStringLength("h💣el💣 world", "h💣elo wor💣ld"), 7);
      assert.equals(util.diffStringLength("hello world", "hello world"), 0);
    });

    test("indexOfRegex", ()=>{
      /**
       * Return the index of the first item in `list` that has a property `fieldName`
       * that contains a match for the regular expression `value`. Or if no match is
       * found return -1.
       * @param list the list to search
       * @param value the regular expression to search `fieldName` for a match
       * @param fieldName the property name to search for in each item in `list`
       *
       * @returns the index of the first item in `list` that has a property `fieldName` that
       * contains a match for the regular expression `value`, or -1 if `list` does not
       * contain such an item
       **/
      api.method('indexOfRegex');
      //[
      const list = [{foo: 'a'}, {foo: 'cbc'}];
      assert.same(util.indexOfRegex(list, /a/, 'foo'), 0);
      assert.same(util.indexOfRegex(list, /ab/, 'foo'), -1);
      assert.same(util.indexOfRegex(list, /b/, 'foo'), 1);
      //]
    });

    test("isObjEmpty", ()=>{
      /**
       * Determine whether `obj` is empty.
       * @param obj an object
       *
       * @returns `true` if `obj` is empty, otherwise `false`
       **/
      api.method('isObjEmpty');
      assert.isTrue(util.isObjEmpty());
      assert.isTrue(util.isObjEmpty({}));
      assert.isFalse(util.isObjEmpty({a: 1}));
    });

    test("hasOnly", ()=>{
      /**
       * Determine if `obj` has only keys that are also in `keyMap`.
       * @param obj an object
       * @param keyMap a set of key-value pairs
       *
       * @returns `true` if `obj` has only keys also in `keyMap`, otherwise `false`
       **/
      api.method('hasOnly');
      assert.isFalse(util.hasOnly({a: 1}, {b: true}));
      assert.isFalse(util.hasOnly({a: 1, b: 1}, {b: true}));
      assert.isTrue(util.hasOnly({b: 1}, {b: true}));
      assert.isTrue(util.hasOnly({}, {b: true}));
      assert.isTrue(util.hasOnly({b: 1, c: 2}, {b: true, c: false}));
    });

    test("keyStartsWith", ()=>{
      /**
       * Determine whether `obj` has a key that starts with `str`. Case sensitive.
       * @param obj the object to search
       * @param str the string to search for
       *
       * @returns `true` if a key is found that starts with `str`, otherwise `false`
       **/
      api.method('keyStartsWith');

      assert.isFalse(util.keyStartsWith(null, 'foo'));
      assert.isFalse(util.keyStartsWith({foz: 1, fizz: 2}, 'foo'));
      assert.isTrue(util.keyStartsWith({faz: true, fooz: undefined, fizz: 2}, 'foo'));
      assert.isTrue(util.keyStartsWith({foo: 1, fizz: 2}, 'foo'));
    });

    test("firstParam", ()=>{
      /**
       * Return the value of the first property in `obj`. Or if `obj` is empty return
       * `undefined`.
       * @param obj an object
       *
       * @returns {any-type} the value of the first property in `obj`, or `undefined` if
       * `obj` is empty
       **/
      api.method('firstParam');
      //[
      assert.same(util.firstParam({a: 1, b: 2}), 1);
      assert.same(util.firstParam({}), undefined);
      assert.same(util.firstParam(), undefined);
      //]
    });

    test("keyMatches", ()=>{
      /**
       * Search for a property name in `obj` that matches `regex`. Test each enumerable
       * property name against `regex` util a match is found. Return the result array
       * from `regex.exec()` if a match is found, or `null` if not.
       * @param obj the object to search
       * @param regex the regular expression to match
       *
       * @returns the result array from `regex.exec()` if a match is found, or `null` if not
       **/
      api.method();
      //[
      assert.same(util.keyMatches({ab: 0, bc: 0, de: 0}, /^b(.)/)[1], 'c');
      assert.isNull(util.keyMatches({ab: 0, bc: 0, de: 0}, /^dee/));
      //]
    });

    test("addItem", ()=>{
      /**
       * Add `item` to `list` if `list` does not already contain `item`.
       * If `item` is added to `list`, return `undefined`. If `list` already
       * contains `item`, return the index of `item`.
       * @param list the list to add `item` to
       * @param {any-type} item the item to add to `list`
       *
       * @returns {undefined|number} Returns `undefined` if `item` is added to `list`.
       * Returns the index of `item` if `list` already contains `item`.
       **/
      api.method('addItem');
      //[
      const list = ['a', 'b'];

      assert.same(util.addItem(list, 'b'), 1);
      assert.same(util.addItem(list, 'a'), 0);

      assert.equals(list, ['a', 'b']);

      assert.same(util.addItem(list, {aa: 123}), undefined);

      assert.equals(list, ['a', 'b', {aa: 123}]);

      assert.same(util.addItem(list, {aa: 123}), 2);

      assert.equals(list, ['a', 'b', {aa: 123}]);
      //]
    });

    test("itemIndex", ()=>{
      /**
       * Return the index of the first element in `list` that matches
       * `item`. If `item` is an object, `itemIndex` returns the index of the first object in
       * `list` that contains all the key-value pairs that `item` contains. If no match is
       * found, -1 is returned.
       * @param list the list to search
       * @param {any-type} item the item to search `list` for
       *
       * @returns the index of `item` if `item` is in `list`, otherwise -1
       **/
      api.method('itemIndex');
      const list = ['a', 'b', {one: 'c', two: 'd'}];

      assert.same(util.itemIndex(list, 'b'), 1);
      assert.same(util.itemIndex(list, 'd'), -1);
      assert.same(util.itemIndex(list, {one: 'c', two: 'd'}), 2);
      assert.same(util.itemIndex(list, {two: 'd'}), 2);
      assert.same(util.itemIndex(list, {one: 'e', two: 'd'}), -1);
    });

    test("removeItem", ()=>{
      /**
       * Remove `item` from `list` and return it. `list` is modified. If `item` is an object,
       * `removeItem` removes the first object in `list` that contains all the key-value
       * pairs that `item` contains. If `list` does not contain `item`, `undefined` is
       * returned.
       * @param list the list from which to remove `item`
       * @param {any-type} item the item to remove from `list`
       *
       * @returns {any-type} the removed item, or `undefined` if `list` does not contain `item`
       **/
      api.method('removeItem');

      //[
      const foo = [1,2,3];
      assert.same(util.removeItem(foo, 2), 2); assert.equals(foo, [1, 3]);

      util.removeItem(foo); assert.equals(foo, [1, 3]);

      assert.same(util.removeItem(foo, 4), undefined); assert.equals(foo, [1, 3]);

      util.removeItem(foo, 1); assert.equals(foo, [3]);

      util.removeItem(foo, 3); assert.equals(foo, []);

      const bar = [{id: 4, name: "foo"}, {id: 5, name: "bar"}, {x: 1}];
      assert.same(util.removeItem(bar, {name: 'bar', x: 1}), undefined);
      assert.equals(bar, [{id: 4, name: "foo"}, {id: 5, name: "bar"}, {x: 1}]);

      assert.equals(util.removeItem(bar, {name: 'bar'}), {id: 5, name: "bar"});
      assert.equals(bar, [{id: 4, name: "foo"}, {x: 1}]);

      assert.equals(util.removeItem(bar, {id: 4, name: 'foo'}), {id: 4, name: 'foo'});
      assert.equals(bar, [{x: 1}]);
      //]
    });

    test("values", ()=>{
      /**
       * Create a list of the values of the enumerable properties of `map`.
       * @param map an object
       *
       * @returns a list made up of the values of the enumerable properties of `map`
       **/
      api.method('values');
      assert.equals(util.values({a: 1, b: 2}), [1,2]);
    });

    test("intersectp", ()=>{
      /**
       * Determine if two lists intersect.
       * @param list1 a list
       * @param list2 a second list
       *
       * @returns `true` if `list1` and `list2` have any element in common, otherwise `false`
       **/
      api.method('intersectp');
      assert(util.intersectp([1,4],[4,5]));
      refute(util.intersectp([1,2],['a']));
    });

    test("union", ()=>{
      /**
       * Create a shallow copy of `first` and add items to the new list, in each case only if the
       * item does not already exist in the new list.
       * @param first a list to be copied
       * @param rest one or more lists of elements to be added to the new list if they do not
       * already exist in the new list
       *
       * @returns a list containing all the elements in `first` and one instance of each of the
       * unique elements in `rest` that are not also in `first`
       **/
      api.method('union');
      assert.equals(util.union([1,2,2,3], [3, 4, 4, 5], [3, 6]), [1, 2, 2, 3, 4, 5, 6]);
      assert.equals(util.union([1,2]), [1, 2]);
      assert.equals(util.union([1,2], null), [1, 2]);
      assert.equals(util.union(null, [1,2]), [1, 2]);
      assert.equals(util.union(null, null), []);
    });

    test("diff", ()=>{
      /**
       * Create a list of all the elements of `list1` that are not also elements of `list2`.
       * @param list1 a list
       * @param list2 another list
       *
       * @returns a list of all the elements of `list1` that are not also elements of `list2`
       **/
      api.method('diff');
      assert.equals(util.diff(), []);
      assert.equals(util.diff([1, 2]), [1, 2]);

      assert.equals(util.diff([1,"2",3, null], ["2",4]), [1, 3, null]);
    });

    test("symDiff", ()=>{
      /**
       * Create a list of all the elements of `list1` and `list2` that belong only to `list1`
       * or `list2`, not to both lists.
       * @param list1 a list
       * @param list2 a second list
       *
       * @returns a list of all the elements of `list1` and `list2` that belong only to `list1`
       * or `list2`, not to both lists
       **/
      api.method('symDiff');
      //[
      assert.equals(util.symDiff(), []);
      assert.equals(util.symDiff([1, 2]), [1, 2]);

      assert.equals(util.symDiff([1,2,3], [2,4]).sort(), [1, 3, 4]);
      assert.equals(util.symDiff([2,4], [1,2,3]).sort(), [1, 3, 4]);
      //]
    });

    test("extend", ()=>{
      let item = 5;
      const sub = {a: 1, b: 2};
      const sup = {b: 3, get c() {return item;}};

      util.merge(sub,sup);

      item = 6;

      assert.same(sub.a,1);
      assert.same(sub.b,3);
      assert.same(sub.c,6);
    });

    test("mergeExclude", ()=>{
      /**
       * Merge `properties` into `obj`, excluding properties in `exclude` that have truthy values.
       * That is, add each property in `properties`, excluding those that have truthy values in
       * `exclude`, to `obj`, or where a property of that name already exists in `obj`, replace
       * the property in `obj` with the property from `properties`. Return the modified `obj`.
       * @param obj an object to modify
       * @param properties properties to be added to or modified in `obj`, unless they are in `exclude`
       * (with truthy values)
       * @param exclude properties which (if they have truthy values) are excluded from being added to or
       * modified in `obj`
       *
       * @returns `obj` modified: each property in `properties`, excluding properties in `exclude`with
       * truthy values, has been added to `obj`, or where a property of that name already existed in `obj`,
       * the property in `obj` has been replaced with the property from `properties`
       **/
      api.method('mergeExclude');
      //[
      let item = 5,
          sub = {a: 1, b: 2},
          sup = {b: 3, get c() {return item;}, d: 4, e: 5};

      util.mergeExclude(sub,sup, {d: true, e: true});

      item = 6;

      assert.same(sub.a,1);
      assert.same(sub.b,3);
      assert.same(sub.c,6);
      refute(sub.hasOwnProperty('d'));
      //]
    });

    test("mergeInclude", ()=>{
      /**
       * Merge the properties from `properties` that are named in `include` into `obj`. That is, add each
       * property in `properties` that is named in `include` to `obj`, or where a property of that name
       * already exists in `obj`, replace the property in `obj` with the property from `properties`.
       * Return the modified `obj`.

       * @param obj an object to modify
       * @param properties properties to be added to or modified in `obj` if they are named in `include`
       * @param {object|array} include properties, or a list of property names, whose names identify
       * which properties from `properties` are to be added to or modified in `obj`

       * @returns `obj` modified: each property in `properties` that is named in `include` has been added
       * to `obj`, or where a property of that name already existed in `obj`, the property in `obj`
       * has been replaced with the property from `properties`
       **/
      api.method();
      //[
      const obj = {a: 1, c: 2};
      const ans = util.mergeInclude(obj, {b: 2, c: 3, d: 4}, {c: true, d: true, z: true});
      assert.equals(ans, {a: 1, c: 3, d: 4});
      assert.same(obj, ans);

      assert.equals(util.mergeInclude({a: 1, c: 2}, {b: 2, c: 3, d: 4}, ['c', 'd', 'z']),
                    {a: 1, c: 3, d: 4});
      //]
    });

    test("extractError", ()=>{
      /**
       * Extract the error message and normalized stack trace from an exception.
       *
       * See {#koru/stacktrace}
       **/
      api.method();
      //[
      const inner1 = ()=> inner2();
      const inner2 = ()=> {
        return new Error("Testing 123");
      };
      const ex = inner1();

      assert.equals(util.extractError(ex).split('\n'), [
        'Error: Testing 123',
        // the "at - " is to distinguish the first frame for editors
        m(/    at - inner2 \(koru\/util-test.js:\d+:16\)/),
        m(/    at inner1 \(koru\/util-test.js:\d+:27\)/),
        m(/    at .* \(koru\/util-test.js:\d+:18\)/),
      ]);
      //]
    });

    test("extractKeys", ()=>{
      /**
       * Create an object made up of the properties in `obj` whose keys are named in `keys`.
       * @param obj the object from which to collect properties
       * @param keys a collection of keys or properties whose names identify which properties to collect
       * from `obj`
       *
       * @returns an object made up of the properties in `obj` whose keys are named in `keys`
       **/
      api.method('extractKeys');
      assert.equals(
        util.extractKeys({a: 4, b: "abc", get c() {return {value: true}}}, ['a', 'c', 'e']),
        {a: 4, c: {value: true}}
      );
      assert.equals(
        util.extractKeys({a: 4, b: "abc", get c() {return {value: true}}}, {a: true, c: false, e: null}),
        {a: 4, c: {value: true}}
      );
    });

    test("extractNotKeys", ()=>{
      /**
       * Create an object made up of the properties in `obj` whose keys are not named in
       * `keys`.
       * @param obj the object from which to collect properties
       * @param keys a collection of properties whose names identify which properties not to
       * collect from `obj`
       *
       * @returns an object made up of the properties in `obj` whose keys are not named in `keys`
       **/
      api.method('extractNotKeys');
      assert.equals(
        util.extractNotKeys({a: 4, b: "abc", get c() {return {value: true}}}, {a: true, e: true}),
        {b: "abc", c: {value: true}}
      );
    });

    test("splitKeys", ()=>{
      /**
       * Create an object containing two properties, `include` and `exclude`. The former
       * is made up of the properties in `obj` whose keys are named in `includeKeys`, and the later
       * is made up of the other properties in `obj`.
       * @param obj the object from which to collect properties
       * @param includeKeys a collection of properties whose names identify which objects to
       * include in the first object returned
       *
       * @returns the `include` and `exclude` objects.
       **/
      api.method('splitKeys');
      //[
      const {include, exclude} = util.splitKeys(
        {a: 4, b: "abc", get c() {return {value: true}}}, {a: true, e: true});

      assert.equals(include, {a: 4});
      assert.equals(exclude, {b: "abc", c: {value: true}});
      //]
    });

    test("shallowEqual arrays", ()=>{
      assert.isTrue(util.shallowEqual([1, 2, 3], [1, 2, 3]));
      assert.isFalse(util.shallowEqual([1, {}, 3], [1, {}, 3]));
      assert.isFalse(util.shallowEqual([1, 2], [1, 2, 3]));
      assert.isFalse(util.shallowEqual([1, 2], [1]));
      assert.isFalse(util.shallowEqual([1, 2], null));
      assert.isFalse(util.shallowEqual('a', [1, 2]));
    });

    test("deepEqual", ()=>{
      assert.isTrue(util.deepEqual(null, null));
      assert.isTrue(util.deepEqual(null, undefined));
      assert.isFalse(util.deepEqual(null, ""));
      assert.isTrue(util.deepEqual({}, {}));
      assert.isTrue(util.deepEqual(/abc/i, /abc/i));
      assert.isFalse(util.deepEqual(/abc/i, /abc/));
      const now = Date.now();
      assert.isTrue(util.deepEqual(new Date(now), new Date(now)));
      assert.isFalse(util.deepEqual(new Date(now), new Date(now+1)));

      assert.isFalse(util.deepEqual({}, []));
      assert.isFalse(util.deepEqual(0, -0));
      assert.isFalse(util.deepEqual({a: 0}, {a: -0}));
      assert.isFalse(util.deepEqual({a: null}, {b: null}));

      const matcher = match(v => v % 2 === 0);
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
    });

    test("elemMatch", ()=>{
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
    });

    test("invert", ()=>{
      assert.equals(util.invert({a: 1, b: 2}), {'1': "a", '2': "b"});
      assert.equals(util.invert({a: 1, b: 2}, x => x+x), {'1': "aa", '2': "bb"});
    });

    test("lookupDottedValue", ()=>{
      assert.same(util.lookupDottedValue("foo.1.bar.baz", {
        a: 1, foo: [{}, {bar: {baz: "fnord"}}]}), "fnord");
      assert.same(util.lookupDottedValue(['foo', 1, 'bar', 'baz'], {
        a: 1, foo: [{}, {bar: {baz: "fnord"}}]}), "fnord");
    });

    test("includesAttributes", ()=>{
      const changes = {b: '2'};
      const doc = {a: '1', b: '3'};

      assert.isTrue(util.includesAttributes({a: 1}, changes, doc, null));
      assert.isTrue(util.includesAttributes({a: 1, b: '2'}, changes, doc, null));
      assert.isFalse(util.includesAttributes({a: 1, b: '3'}, changes, doc, null));
      assert.isFalse(util.includesAttributes({a: 2, b: '2'}, changes, doc, null));
    });

    test("regexEscape", ()=>{
      assert.same(util.regexEscape('ab[12]\\w.*?\\b()'), 'ab\\[12\\]\\\\w\\.\\*\\?\\\\b\\(\\)');
    });

    test("newEscRegex", ()=>{
      assert.match('ab[12]\\w.*?\\b()', util.newEscRegex('ab[12]\\w.*?\\b()'));
    });

    test("pick", ()=>{
      assert.equals(util.pick(), {});
      assert.equals(util.pick({a: 1, b: 2, c: 3}, 'a', 'c'), {a:1, c: 3});
    });

    test("mapToSearchStr", ()=>{
      assert.same(util.mapToSearchStr({'a +b': 'q[a]', foo: 'bar'}), "a%20%2Bb=q%5Ba%5D&foo=bar");
    });

    test("encodeURIComponent", ()=>{
      assert.same(util.encodeURIComponent(0), '0');
      assert.same(util.encodeURIComponent(), '');
      assert.same(util.encodeURIComponent(null), '');

      assert.same(util.encodeURIComponent("'!@#$%^&*()_hello world"),
                  '%27%21%40%23%24%25%5E%26%2A%28%29_hello%20world');
    });

    test("decodeURIComponent", ()=>{
      assert.same(util.decodeURIComponent(''), null);
      assert.same(util.decodeURIComponent(
        '%27%21%40%23%24%25%5E%26%2A%28%29_hello%20world+again'), "'!@#$%^&*()_hello world again");
      assert.same(util.decodeURIComponent(
        '<%= foo._id %>'), "<%= foo._id %>");

    });

    test("searchStrToMap", ()=>{
      assert.equals(util.searchStrToMap("a%20%2Bb=q%5Ba%5D&foo=bar"), {'a +b': 'q[a]', foo: 'bar'});
      assert.equals(util.searchStrToMap(null), {});

    });

    test("forEach", ()=>{
      /**
       * Execute `visitor` once for each element in `list`.
       * @param list a list
       * @param visitor a function taking two arguments: the value of the current element in `list`,
       * and the index of that current element
       **/
      api.method('forEach');

      //[
      const results = [];
      util.forEach([1,2,3], (val, index) => {results.push(val+"."+index)});
      assert.equals(results, ['1.0', '2.1', '3.2']);

      // ignores null list
      const callback = stub();
      util.forEach(null, callback);
      refute.called(callback);
      //]
    });

    test("reverseForEach", ()=>{
      /**
       * Visit `list` in reverse order, executing `visitor` once for each list element.
       * @param list a list
       * @param visitor a function taking two arguments: the value of the current element in `list`,
       * and the index of that current element
       **/
      api.method('reverseForEach');
      //[
      const results = [];
      util.reverseForEach(v.list = [1,2,3], (val, index) => {
        results.push(val+"."+index);
      });
      assert.equals(results, ['3.2', '2.1', '1.0']);

      // ignores null list
      const callback = stub();
      util.reverseForEach(null, callback);
      refute.called(callback);
      //]
    });


    test("append", ()=>{
      const list1 = [1, 2, 3];

      assert.same(util.append(list1, [4, 3]), list1);
      assert.equals(list1, [1, 2, 3, 4, 3]);

      const args = testArgs(1, 2);

      util.append(args, [4, 5]);

      assert.same(args[3], 5);

      function testArgs() {return arguments}
    });

    test("arrayToMap", ()=>{
      /**
       * convert an array of strings to an `object`.

       * @param {[String]} list the array to convert

       * @returns with its properties named the `list` elements and values of true.
       **/
      api.method();
      assert.equals(util.arrayToMap(), {});
      assert.equals(util.arrayToMap(['a', 'b', 'd']), {a: true, b: true, d: true});
    });

    test("toMap", ()=>{
      /**
       * convert to a `object`;
       **/
      api.method();
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
    });

    test("mapLinkedList", ()=>{
      const a = {foo: 1, next: {foo: 2, next: null}};
      assert.equals(util.mapLinkedList(a, n => n.foo), [1, 2]);
    });

    test("mapField", ()=>{
      assert.same(util.mapField(null), null);

      assert.equals(util.mapField([]), []);
      assert.equals(util.mapField([{_id: 1}, {_id: 2}]), [1, 2]);
      assert.equals(util.mapField([{foo: 2, bar: 4}, {foo: "ab"}], 'foo'), [2, "ab"]);
    });

    test("idNameListToMap", ()=>{
      assert.equals(util.idNameListToMap([['a', 'a a'], ['b', 'b b']]), {a: "a a", b: "b b"});
    });

    test("find ", ()=>{
      assert.same(util.find([1,8,7,3], (value, idx)=> value > 5 && idx === 2), 7);

      assert.same(util.find([1,8,7,3], (value, idx)=> false), undefined);
    });

    test("binarySearch", ()=>{
      /**
       * Perform a binary search over a sorted `list` and return the closest index with a <= 0
       * `compare` result.
       **/
      api.method();
      assert.same(util.binarySearch([], row => assert(false)), -1);

      const list = [1,3,6,8,10,13,15];
      assert.same(util.binarySearch([1,2,3], row => 1, 0), -1);
      assert.same(util.binarySearch([1,2,3], row => -1, 0), 2);
      assert.same(util.binarySearch(list, row => row - 0), -1);
      assert.same(util.binarySearch(list, row => row - 1), 0);
      assert.same(util.binarySearch(list, row => row - 16), 6);
      assert.same(util.binarySearch(list, row => row - 5), 1);
      assert.same(util.binarySearch(list, row => row - 6, 0), 2);
      assert.same(util.binarySearch(list, row => row - 10), 4);
      assert.same(util.binarySearch(list, row => row - 14), 5);

      assert.same(util.binarySearch(list, row => row - 8, -1), 3);
      assert.same(util.binarySearch(list, row => row - 8, 7), 3);
    });

    test("flatten", ()=>{
      assert.equals(util.flatten([1, [2, 6, [4]], [], 7, 8]), [1, 2, 6, 4, 7, 8]);
      assert.equals(util.flatten([1, [2, 6, [4]], [], 7, 8], true), [1, 2, 6, [4], 7, 8]);
    });

    test("findBy", ()=>{
      const list = [{foo: 'a', _id: 2}, {foo: 'b', _id: 1}];
      assert.same(util.findBy(list, 1), list[1]);
      assert.same(util.findBy(list, 2), list[0]);
      assert.same(util.findBy(list, 'a', 'foo'), list[0]);
      assert.same(util.findBy(list, 'b', 'foo'), list[1]);
    });

    test("indexOf ", ()=>{
      const data = [{_id: 1, age: 20}, {_id: 2, age: 30}];

      // default field (_id)
      assert.same(util.indexOf(data, 1), 0);
      assert.same(util.indexOf(data, 2), 1);
      assert.same(util.indexOf(data, 3), -1);

      // explicit field (age)
      assert.same(util.indexOf(data, 30, 'age'), 1);
      assert.same(util.indexOf(data, 20, 'age'), 0);
      assert.same(util.indexOf(data, 3, 'age'), -1);
    });

    test("createDictionary", ()=>{
      /**
       * Create an object that hints to the VM that it will be used as a dynamic dictionary
       * rather than as a class.
       * @return a new object with no prototype
       **/
      api.method('createDictionary');

      const dict = util.createDictionary();
      assert.same(Object.getPrototypeOf(dict), null);
      assert(util.isObjEmpty(dict));
      assert(dict && typeof dict === 'object');
    });

    test("shallowCopy", ()=>{
      assert.same(util.shallowCopy(1), 1);
      assert.same(util.shallowCopy(true), true);
      assert.same(util.shallowCopy(null), null);
      assert.same(util.shallowCopy(undefined), undefined);
      assert.same(util.shallowCopy("a"), "a");

      /** sparse array **/
      const ans = util.shallowCopy([1,2,,,3]);
      assert.equals(ans.map((d, i) => `${d}:${i}`), ['1:0', '2:1', , , '3:4']);

      const func = ()=>{};
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
    });

    test("deepCopy", ()=>{
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

      const func = ()=>{};
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

    });

    test("camelize", ()=>{
      assert.same(util.camelize(""), "");
      assert.same(util.camelize("abc"), "abc");
      assert.same(util.camelize("abc-def_xyz.qqq+foo%bar"), "abcDefXyzQqqFooBar");
      assert.same(util.camelize("CarlySimon"), "CarlySimon");
    });

    test("niceFilename", ()=>{
      assert.same(util.niceFilename("a1!@#$%/sdffsdDDfdsf/fds.txt"), 'a1-sdffsdddfdsf-fds-txt');
    });

    test("titleize", ()=>{
      assert.same(util.titleize(""), "");
      assert.same(util.titleize("abc"), "Abc");
      assert.same(util.titleize("abc-def_xyz.qqq+foo%bar"), "Abc Def Xyz Qqq Foo Bar");
      assert.same(util.titleize("CarlySimon"), "Carly Simon");
    });

    test("humanize", ()=>{
      assert.same(util.humanize('camelCaseCamel_id'), "camel case camel");
      assert.same(util.humanize('Hyphens-and_underscores'), "hyphens and underscores");
    });

    test("pluralize", ()=>{
      assert.same(util.pluralize('day', 1), 'day');
      assert.same(util.pluralize('day', 2), 'days');
    });

    test("initials", ()=>{
      assert.same(util.initials(null, 2), "");
      assert.same(util.initials("Sam THE BIG Man", 2), "SM");
      assert.same(util.initials("Sam the BIG man"), "STM");
      assert.same(util.initials("Prince"), "P");
      assert.same(util.initials("Princetui", 3, 'abrv'), "PRN");
    });

    test("hashToCss", ()=>{
      assert.same(util.hashToCss({foo: 1, bar: "two"}), "foo:1;bar:two");

    });

    test("compare", ()=>{
      /**
       * uses en-US collating
       **/
      assert.isTrue(util.compare("albert", "Beatrix") < 0);
      assert.isTrue(util.compare("Albert", "beatrix") < 0);
      assert.isTrue(util.compare("Albert", "albert") > 0);
      assert.isTrue(util.compare("Albert", "Albert") == 0);
    });

    test("compareByName", ()=>{
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

    });

    test("compareByOrder", ()=>{
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
    });

    test("compareByField", ()=>{
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
    });

    test("compareByFields", ()=>{
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
    });

    test("hasOwn", ()=>{
      const a = {
        y: null,
        z: undefined,
      };

      const b = Object.create(a);
      b.y = false; b.a = 0;

      const {hasOwn} = util;

      assert.isTrue(hasOwn(a, 'z'));
      assert.isTrue(hasOwn(a, 'y'));
      assert.isFalse(hasOwn(b, 'z'));
      assert.isTrue(hasOwn(b, 'y'));
    });

    test("colorToArray", ()=>{
      assert.equals(util.colorToArray(''), '');
      assert.equals(util.colorToArray([1,2,3,0.5]), [1,2,3,0.5]);
      assert.equals(util.colorToArray("#ac3d4f"), [172, 61, 79, 1]);
      assert.equals(util.colorToArray("#d4faf480"), [212, 250, 244, 0.5]);

      assert.equals(util.colorToArray("rgb(212, 250,244, 0.2)"), [212, 250, 244, 0.2]);
      assert.equals(util.colorToArray("rgba(212, 150,244, 0.8)"), [212, 150, 244, 0.8]);

      assert.equals(util.colorToArray("#ac3"), [170, 204, 51, 1]);
    });

    group("nestedHash", ()=>{
      test("setNestedHash", ()=>{
        const hash = {};

        util.setNestedHash(123, hash, 'a', 'b');
        assert.same(util.setNestedHash(456, hash, 'a', 'c'), 456);

        assert.equals(hash, {a: {b: 123, c: 456}});
      });

      test("getNestedHash", ()=>{
        const hash = {a: {b: 123, c: 456}};

        assert.equals(util.getNestedHash(hash, 'a', 'b'), 123);
        assert.equals(util.getNestedHash(hash, 'a'), {b: 123, c: 456});
        assert.equals(util.getNestedHash(hash, 'b'), undefined);
        assert.equals(util.getNestedHash(hash, 'a', 'd'), undefined);
      });

      test("deleteNestedHash", ()=>{
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
      });
    });

    test("reverseMerge", ()=>{
      let item = 5;
      const sub={a: 1, b: 2};
      const sup = {d: 'd', b: 3, get c() {return item;}};

      util.reverseMerge(sub,sup, {d: 1});

      item = 6;

      assert.same(sub.a,1);
      assert.same(sub.b,2);
      assert.same(sub.c,6);
      refute('d' in sub);
    });

    test("adjustTime", ()=>{
      util.adjustTime(-util.timeAdjust);
      stub(Date, 'now').returns(12345);
      after(_=>{util.adjustTime(-util.timeAdjust)});
      assert.same(util.timeAdjust, 0);
      assert.same(util.timeUncertainty, 0);

      assert.same(util.dateNow(), 12345);

      util.adjustTime(4, 3);

      assert.same(util.timeUncertainty, 3);
      assert.same(util.dateNow(), 12349);

      util.adjustTime(-1);

      assert.same(util.timeUncertainty, 0);
      assert.same(util.dateNow(), 12348);
    });

    test("withDateNow", ()=>{
      const date = new Date("2013-06-09T23:10:36.855Z");
      const result = util.withDateNow(date, ()=>{
        assert.equals(util.newDate(), date);
        assert.equals(util.dateNow(), +date);
        assert.same(util.withDateNow(+date + 123, ()=>{
          assert.equals(util.newDate(), new Date(+date + 123));
          assert.equals(util.dateNow(), +date + 123);

          if (isServer) {
            assert.same(util.thread, util.Fiber.current.appThread);
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
    });

    test("dateInputFormat", ()=>{
      assert.same(util.dateInputFormat(new Date(2015, 0, 15)), "2015-01-15");
    });

    test("yyyymmddToDate", ()=>{
      assert.equals(util.yyyymmddToDate(' 2015-5-04  '), new Date(2015, 4, 4));
      assert.equals(util.yyyymmddToDate('1969 04 09'), new Date(1969, 3, 9));
      assert.equals(util.yyyymmddToDate('1999-12-31'), new Date(1999, 11, 31));
      assert.equals(util.yyyymmddToDate('2011/02/6'), new Date(2011, 1, 6));
      assert.equals(util.yyyymmddToDate('2011-02/6'), undefined);
      assert.equals(util.yyyymmddToDate('2011/11/32'), undefined);
      assert.equals(util.yyyymmddToDate('2011/13/3'), undefined);
    });

    test("twoDigits", ()=>{
      assert.same(util.twoDigits(9), '09');
      assert.same(util.twoDigits(10), '10');
    });

    test("emailAddress", ()=>{
      assert.same(util.emailAddress('a@xyz.co', 'f<o>o <b<a>r>'), 'foo bar <a@xyz.co>');
    });

    test("extractFromEmail", ()=>{
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
    });

    test("compareVersion", ()=>{
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
    });


    test("parseEmailAddresses", ()=>{
      assert.isNull(util.parseEmailAddresses("foo@bar baz"));
      assert.isNull(util.parseEmailAddresses("foo@ba_r.com"));


      assert.equals(util.parseEmailAddresses("foo@bar.baz.com fnord"),
                    {addresses: ["foo@bar.baz.com"], remainder: "fnord"});

      assert.equals(
        util.parseEmailAddresses("a b c <abc@def.com> foo-_+%bar@vimaly-test.com, "),
        {addresses: ["a b c <abc@def.com>", "foo-_+%bar@vimaly-test.com"], remainder: "" });
    });

    test("toHex", ()=>{
      /**
       * Convert a byte array to a hex string

       **/
      api.method();
      //[
      assert.equals(util.toHex(new Uint8Array([3, 6, 8, 129, 255])), '03060881ff');
      //]
    });

    test("withId", ()=>{
      /**
       * Associate `object` with `_id`.
       * @param _id an id to associate with `object`
       * @param object an object to associate with `_id`
       * @param key defaults to [Symbol.withId$](#koru/Symbol)
       *
       * @returns an associated object which has the given `_id` and a prototype of
       * `object`. If an association for `key` is already attached to the `object` then it is used
       * otherwise a new one will be created.
       **/
      api.method('withId');

      //[
      const jane = {name: 'Jane', likes: ['Books']};
      const myKey$ = Symbol();
      const assoc = util.withId(jane, 123, myKey$);
      assert.same(assoc.likes, jane.likes);
      assert.same(Object.getPrototypeOf(assoc), jane);

      assert.same(assoc._id, 123);

      assert.same(util.withId(jane, 456, myKey$), assoc);
      assert.same(assoc._id, 456);

      refute.same(util.withId(jane, 456), assoc);
      assert.same(util.withId(jane, 456).likes, jane.likes);
      //]
    });
  });
});

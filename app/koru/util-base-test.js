define((require, exports, module)=>{
  'use strict';
  const api             = require('koru/test/api');
  const TH              = require('koru/test-helper');

  const {inspect$} = require('koru/symbols');

  const util = require('./util');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      api.module({subjectModule: module.get('./util'), subjectName: 'util'});
    });

    test("properties", ()=>{
      api.property('idLen', v => `${v}. The length of an \`_id\` in characters.`);
      assert.same(util.idLen, 17);

    });

    test('at', ()=>{
      const a= '0123';
      assert.same(a.at(0), '0');
      assert.same(a.at(-1), '3');
    });

    test("inspect", ()=>{
      /**
       * Convert any type to a displayable string. The symbol `inspect$` can be used to override
       * the value returned.
       *
       **/
      api.method('inspect');
      //[
      const obj = { '': 0, 123: 1, 'a"b"`': 2, "a`'": 3, "a\"'`": 4, '\\a': 5 };
      assert.equals(
        util.inspect(obj),
        `{123: 1, '': 0, 'a"b"\`': 2, "a\`'": 3, "a\\"'\`": 4, '\\\\a': 5}`);

      const array = [1,2,3];
      assert.equals(
        util.inspect(array),
        "[1, 2, 3]"
      );

      array[inspect$] = ()=>"overridden";

      assert.equals(util.inspect(array), "overridden");
      //]
    });

    test("qlabel", ()=>{
      /**
       * Quote label. Add quotes only if needed to be used as a property name.
       **/
      api.method();
      //[
      assert.equals(util.qlabel("1234"), '1234');
      assert.equals(util.qlabel("abc123"), 'abc123');
      assert.equals(util.qlabel("a'234"), `"a'234"`);
      assert.equals(util.qlabel("123a"), `'123a'`);
      assert.equals(util.qlabel('ab\nc'), `'ab\\nc'`);
      //]
    });

    test("qstr", ()=>{
      /**
       * Quote string
       **/
      api.method();
      //[
      assert.equals(util.qstr("1234"), "'1234'");
      assert.equals(util.qstr("1'234"), `"1'234"`);
      assert.equals(util.qstr('12"3a'), `'12"3a'`);
      assert.equals(util.qstr("\r"), '"\\r"');
      assert.equals(util.qstr('12\n3a'), `'12\\n3a'`);
      assert.equals(util.qstr('12\\n3a'), `'12\\\\n3a'`);
      //]
    });

    test("mergeNoEnum", ()=>{
      /**
       * Merge `source` into `dest` and set `enumerable` to `false` for each added or modified
       * property. That is, add each enumerable property in `source` to `dest`, or where a
       * property of that name already exists in `dest`, replace the property in `dest` with the
       * property from `source`, and set `enumerable` to `false` for each. Return the modified `dest`.
       * @param dest an object to modify
       * @param source the properties to be added or modified
       *
       * @returns `dest` modified: each enumerable property in `source` has been added to `dest`, or where
       * a property of that name already existed in `dest`, the property in `dest` has been
       * replaced with the property from `source`, in each case with `enumerable` set to `false`
       **/
      api.method('mergeNoEnum');
      //[
      const book = {author: 'Austen'};
      let pages = 0;

      util.mergeNoEnum(book, {
        published: 1813,

        get pages() {return pages},
      });

      pages = 432;
      assert.equals(Object.keys(book), ['author']);
      assert.same(book.published, 1813);
      assert.same(book.pages, 432);
      //]
    });

    test("merge", ()=>{
      /**
       * Merge `source` into `dest`. That is, add each enumerable property in `source` to `dest`, or where a
       * property of that name already exists in `dest`, replace the property in `dest` with the
       * property from `source`. Return the modified `dest`.
       * @param dest an object to modify
       * @param source the properties to be added or modified
       *
       * @returns `dest` modified: each enumerable property in `source` has been added to `dest`, or where
       * a property of that name already existed in `dest`, the property in `dest` has been
       * replaced with the property from `source`
       *
       * @alias extend deprecated
       **/
      api.method();
      const orig = {a: 1, b: 2};
      const result = {};
      assert.same(util.merge(result, orig), result);

      refute.same(result, orig);

      assert.equals(result, orig);

      assert.equals(util.merge({a: 1}), {a: 1});
      assert.equals(util.merge({a: 1, b: 2}, {b: 3, c: 4}), {a: 1, b: 3, c: 4});

      const a = {a: 1, b: 2};
      const b = util.merge(Object.create(a), {b: 3, c: 4});

      const c = {d: 5};

      const ans = util.merge(c, b);

      assert.same(ans, c);
      assert.equals(ans, {d: 5, b: 3, c: 4});

    });

    test("last", ()=>{
      assert.same(util.last([1, 4]), 4);
    });
  });
});

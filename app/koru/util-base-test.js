define((require, exports, module)=>{
  const api             = require('koru/test/api');
  const TH              = require('koru/test-helper');

  const {inspect$} = require('koru/symbols');

  const util = require('./util');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      api.module({subjectModule: module.get('./util'), subjectName: 'util'});
    });

    test("properties", ()=>{
      api.property('idLen', v => `The length of an \`_id\` is ${v} characters`);
      assert.same(util.idLen, 17);

    });

    test("inspect", ()=>{
      /**
       * Convert any type to a displayable string. The symbol `inspect$` can be used to override
       * the value returned.
       *
       **/
      api.method('inspect');
      //[
      const obj = {"": 0, 123: 1, 'a"b"`': 2, "a`'": 3, "a\"'`": 4, "\\a": 5};
      assert.equals(
        util.inspect(obj),
        `{123: 1, "": 0, 'a"b"\`': 2, "a\`'": 3, "a\\"'\`": 4, "\\\\a": 5}`);

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
      assert.equals(util.qlabel("1234"), '1234');
      assert.equals(util.qlabel("1'234"), `"1'234"`);

    });

    test("mergeNoEnum", ()=>{
      /**
       * Merge `source` into `dest` but do not set `enumerable` on the
       * descriptor.
       *
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
       * Merge `source` into `dest`.
       *
       * @alias extend deprecated
       **/
      api.method('merge');
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

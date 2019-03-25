isServer && define((require, exports, module)=>{
  'use strict';
  const Driver          = require('koru/pg/driver');
  const api             = require('koru/test/api');
  const TH              = require('koru/test-helper');

  const {stub, spy, onEnd, util} = TH;

  const SQLStatement = require('./sql-statement');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("constructor", ()=>{
      /**
       * Compile a SQLStatement
       **/
      const SQLStatement = api.class();

      const statment = new SQLStatement(
        `SELECT {$foo}::int+{$bar}::int as a, {$foo}::text || '0' as b`);

      assert.equals(Driver.defaultDb.query(statment, {foo: 10, bar: 5})[0], {a: 15, b: '100'});

      assert.equals(Driver.defaultDb.query(new SQLStatement('select 1 as a'))[0], {a: 1});
    });

    test("convertArgs", ()=>{
      /**
       * Convert key-value param to a corresponding paramter array for this statement. If an
       * `initial` parameter is supplied then parameters will be appended to that array. This
       * determines what `$n` parameters will be returned in the `#text` property.

       * @param param the key-values to convert to an array.

       * @param initial An existing list of parameters. Defaults to empty list

       * @return `initial`

       **/
      api.protoMethod();

      api.protoProperty('text', {info() {
        /**
         * The converted query text with inserted numeric parameters; changes when {##convertArgs} is
         * called.
         *
         **/
      }});
      //[
      const statment = new SQLStatement(`SELECT {$foo}::int+{$bar}::int as a, {$foo}::text || '0' as b`);

      assert.equals(statment.convertArgs({foo: 10, bar: 9}), [10, 9]);

      assert.equals(statment.text, "SELECT $1::int+$2::int as a, $1::text || '0' as b");

      assert.equals(statment.convertArgs({foo: 30, bar: 40}, [1, 2]), [1, 2, 30, 40]);

      assert.equals(statment.text, "SELECT $3::int+$4::int as a, $3::text || '0' as b");
      //]

      const s2 = new SQLStatement(`SELECT {$foo} || {$foo} || {$bar} || {$bar}`);
      assert.equals(s2.text, 'SELECT $1 || $1 || $2 || $2');
    });

    test("clone", ()=>{
      /**
       * Clone this SQLStatement.
       **/
      api.protoMethod();

      const s1 = new SQLStatement(`SELECT {$foo}::int`);
      const s2 = s1.clone();
      s2.convertArgs({foo: 1}, [1, 2]);
      assert.equals(s1.text, 'SELECT $1::int');
      assert.equals(s2.text, 'SELECT $3::int');
    });

    test("append", ()=>{
      /**
       * Append an SQLStatement to this SQLStatement. Converts this statement.

       * @param value the statement to append.

       * @return this statement.
       **/

      //[
      const s1 = new SQLStatement(`SELECT {$foo}::int`);
      const s2 = new SQLStatement(', {$bar}::int+{$foo}::int');
      assert.same(s1.append(s2), s1);

      assert.equals(s1.text, 'SELECT $1::int, $2::int+$1::int');
      //]

      {
        const s1 = new SQLStatement(`SELECT {$foo}`);
        const s2 = new SQLStatement('{$bar}');
        assert.same(s1.append(s2).append(s2), s1);

        s2.convertArgs({foo: 1, bar: 2}, [1,2,3]);

        assert.equals(s2.append(s1).text, '$1SELECT $2$1$1');
        assert.equals(s1.text, 'SELECT $1$2$2');
      }
    });
  });
});

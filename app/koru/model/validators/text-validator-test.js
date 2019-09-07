define((require, exports, module)=>{
  'use strict';
  /**
   * Text validators and convertors.
   *
   * Enable with {#../../validation.register;(module, TextValidator)} which is conventionally done
   * in `app/models/model.js`
   **/
  const Val             = require('koru/model/validation');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const ValidatorHelper = require('./validator-helper');

  const {error$} = require('koru/symbols');

  const TextValidator   = require('./text-validator');

  class Book extends ValidatorHelper.ModelStub {
  }
  Book.registerValidator(TextValidator);

  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{

    group("normalize", ()=>{
      /**
       * Ensure text is in a normalized form
       * @param options `"upcase"` to convert field to upper case. `"downcase"` to convert field to
       * lower case. Other values are ignored.
       **/

      before(()=>{
        api.method();
      });

      test("downcase", ()=>{
        //[
        Book.defineFields({
          title: {type: 'text', normalize: 'downcase'}
        });
        const book = Book.build({title: 'Animal Farm'});

        assert(book.$isValid());

        assert.same(book.title, 'animal farm');
        //]
      });

      test("upcase", ()=>{
        //[
        Book.defineFields({
          title: {type: 'text', normalize: 'upcase'}
        });
        const book = Book.build({title: 'Animal Farm'});
        assert(book.$isValid());

        assert.same(book.title, 'ANIMAL FARM');
        //]
      });

      test("asserts string", ()=>{
        //[
        Book.defineFields({
          title: {type: 'text', normalize: 'upcase'}
        });
        const book = Book.build({title: 12345});

        refute(book.$isValid());
        assert.same(book.title, 12345);
        assert.equals(book[error$].title,[['not_a_string']]);

        book.title = null;
        assert(book.$isValid());
        //]
      });
    });

    test("multi validators", ()=>{
      Book.defineFields({
        title: {type: 'text', normalize: 'upcase', trim: true}
      });
      const book = Book.build({title: " hello "});
      assert(book.$isValid());

      assert.same(book.title, "HELLO");

      book.title = 123;
      refute(book.$isValid());
      assert.equals(book[error$].title,[['not_a_string']]);
    });

    group("boolean", ()=>{
      /**
       * Ensure field is a boolean. Strings of trimmed lower case `'true'`, `'on'`, `'1'` and `'t'`
       * are converted to `true`. Strings of trimmed lower case `'false'`, `'off'`, `'0'` and `'f'`
       * are converted to `false`. If converted value is not of type `boolean`, `undefined` or
       * `null` a `'not_a_boolean'` error is added.

       * @param options use `"trueOnly"` to convert field to `undefined` if not `true`.
       **/

      before(()=>{
        api.method();
      });

      test("trueOnly", ()=>{
        //[
        // trueOnly
        Book.defineFields({
          inPrint: {type: 'boolean', boolean: 'trueOnly'}
        });
        const book = Book.build({inPrint: false});

        assert(book.$isValid());
        assert.same(book.inPrint, void 0);

        book.inPrint = true;

        assert(book.$isValid());
        assert.same(book.inPrint, true);
        //]
      });

      test("set true", ()=>{
        //[
        // accepted true values
        Book.defineFields({
          inPrint: {type: 'boolean', boolean: true}
        });
        const book = Book.build();
        for (const val of ['trUe  ', 'T', ' 1', 'on', true]) {
          book.inPrint = val;

          assert(book.$isValid());
          assert.isTrue(book.inPrint);
        }
        //]
      });

      test("set false", ()=>{
        //[
        // accepted false values
        Book.defineFields({
          inPrint: {type: 'boolean', boolean: true}
        });
        const book = Book.build();
        for (const val of [' FALSE  ', 'f', ' 0', 'off', false]) {
          book.inPrint = val;

          assert(book.$isValid());
          assert.isFalse(book.inPrint);
        }
        //]
      });

      test("set invalid", ()=>{
        //[
        // invalid values
        Book.defineFields({
          inPrint: {type: 'boolean', boolean: true}
        });
        const book = Book.build();
        for (const val of [' FALS  ', 'tru', '  ', 0, 1]) {
          book.inPrint = val;

          refute(book.$isValid());
          assert.same(book.inPrint, val);
          assert.equals(book[error$]['inPrint'],[['not_a_boolean']]);
        }
        //]
      });

      test("null, undefined", ()=>{
        //[
        // null or undefined
        Book.defineFields({
          inPrint: {type: 'boolean', boolean: true}
        });
        const book = Book.build({inPrint: null});

        assert(book.$isValid());
        assert.same(book.inPrint, void 0);

        book.inPrint = void 0;

        assert(book.$isValid());
        assert.same(book.inPrint, void 0);
        //]
      });
    });

    group("date", ()=>{
      test("valid", ()=>{
        let doc = {startDate: new Date()};

        TextValidator.date.call(Val, doc, 'startDate');
        refute(doc[error$]);

        doc = {startDate: '2015-12-31'};

        TextValidator.date.call(Val, doc, 'startDate');
        refute(doc[error$]);

        assert.equals(doc.startDate, new Date(2015, 11, 31));

        doc = {startDate: '2015-12-31T13:14Z'};

        TextValidator.date.call(Val, doc, 'startDate');
        refute(doc[error$]);

        assert.equals(doc.startDate, new Date('2015-12-31T13:14Z'));
      });

      test("invalid", ()=>{
        const doc = {startDate: 'abc'};

        TextValidator.date.call(Val, doc, 'startDate');
        assert(doc[error$]);
        assert.equals(doc[error$]['startDate'],[['not_a_date']]);
      });
    });

    group("number", ()=>{
      test("min value", ()=>{
        let doc = {order: 123};

        TextValidator.number.call(Val, doc,'order', {$gte: 123});
        refute(doc[error$]);

        TextValidator.number.call(Val, doc,'order', {$gt: 122});
        refute(doc[error$]);

        TextValidator.number.call(Val, doc,'order', {'>=': 124});
        assert(doc[error$]);
        assert.equals(doc[error$]['order'],[['cant_be_less_than', 124]]);

        doc = {order: 123};

        TextValidator.number.call(Val, doc,'order', {'>': 123});
        assert(doc[error$]);
        assert.equals(doc[error$]['order'],[['must_be_greater_than', 123]]);
      });

      test("negative", ()=>{
        const doc = {order: -4};
        TextValidator.number.call(Val, doc,'order', {integer: true, $gte: 0, $lt: 999});
        assert(doc[error$]);
        assert.equals(doc[error$]['order'],[['cant_be_less_than', 0]]);
      });

      test("max value", ()=>{
        let doc = {order: 123};

        TextValidator.number.call(Val, doc,'order', {$lte: 123});
        refute(doc[error$]);

        TextValidator.number.call(Val, doc,'order', {$lt: 124});
        refute(doc[error$]);

        TextValidator.number.call(Val, doc,'order', {'<=': 122});
        assert(doc[error$]);
        assert.equals(doc[error$]['order'],[['cant_be_greater_than', 122]]);

        doc = {order: 123};

        TextValidator.number.call(Val, doc,'order', {'<': 123});
        assert(doc[error$]);
        assert.equals(doc[error$]['order'],[['must_be_less_than', 123]]);
      });

      test("integer", ()=>{
        const doc = {order: 123};

        TextValidator.number.call(Val, doc,'order', {integer: true});
        refute(doc[error$]);

        TextValidator.number.call(Val, doc,'order', 'integer');
        refute(doc[error$]);

        doc.order = 123.65;

        TextValidator.number.call(Val, doc,'order', {integer: 'convert'});
        refute(doc[error$]);
        assert.same(doc.order, 124);

        doc.order = 123.65;

        TextValidator.number.call(Val, doc,'order', {integer: true});
        assert(doc[error$]);
        assert.equals(doc[error$]['order'],[['not_an_integer']]);
      });

      test("valid", ()=>{
        const doc = {order: 123};

        TextValidator.number.call(Val, doc,'order');
        refute(doc[error$]);

        doc.order = 0;
        TextValidator.number.call(Val, doc,'order');
        refute(doc[error$]);
      });

      test("string as number", ()=>{
         const doc = {order: '0xabc'};

        TextValidator.number.call(Val, doc,'order');
        refute(doc[error$]);

        assert.same(doc.order,0xabc);
      });

      test("empty", ()=>{
         const doc = {order: ''};

        TextValidator.number.call(Val, doc,'order');
        refute(doc[error$]);

        assert.same(doc.order, null);
      });

      test("invalid", ()=>{
        const doc = {order: 'abc'};

        TextValidator.number.call(Val, doc,'order');
        assert(doc[error$]);
        assert.equals(doc[error$]['order'],[['not_a_number']]);
      });
    });

    group("trim", ()=>{
      test("invalid", ()=>{
        const doc = {name: 123};

        TextValidator.trim.call(Val, doc,'name');
        assert(doc[error$]);
        assert.equals(doc[error$]['name'],[['not_a_string']]);
      });

      test("toNull", ()=>{

        const doc = {name: '  '};

        TextValidator.trim.call(Val, doc,'name', 'toNull');

        refute(doc[error$]);
        assert.same(doc.name, null);

      });

      test("toUndefined", ()=>{

        const doc = {name: '  '};

        TextValidator.trim.call(Val, doc,'name', 'toUndefined');

        refute(doc[error$]);
        assert.same(doc.name, void 0);

      });

      test("trims", ()=>{
        const doc = {name: '  in  the middle  '};

        TextValidator.trim.call(Val, doc,'name');
        refute(doc[error$]);
        assert.same(doc.name, 'in  the middle');
      });
    });

    group("color", ()=>{
      test("valid alpha", ()=>{
        const colors = ['#000000', '#12ab3487', '#123456', '#ffffff'],
              doc = {color: ''};

        for(let i=0,item;item=colors[i];++i) {
          doc.color = item;
          TextValidator.color.call(Val, doc,'color', 'alpha');
          refute.msg('should be valid: '+item)(doc[error$]);
        }
      });

      test("valid non-alpha", ()=>{
        const colors = ['#00000005', '#12ab3480', '#123456', '#ffffff'],
              doc = {color: ''};

        for(let i=0,item;item=colors[i];++i) {
          doc.color = item;
          TextValidator.color.call(Val, doc,'color');
          refute.msg('should be valid: '+item)(doc[error$]);
          assert.same(doc.color, item.slice(0, 7));

        }
      });

      test("invalid alpha", ()=>{
        const colors = ['#ac', '#0000', '123456', '#0000001', '#12ab3g', '#fff', '#Ffffff'],
            doc = {color: ''};

        for(let i=0,item;item=colors[i];++i) {
          doc.color = item;
          doc[error$] = {};
          TextValidator.color.call(Val, doc,'color');

          assert.equals(doc[error$]['color'],[['is_invalid']]);
        }
      });

      test("invalid nonalpha", ()=>{
        const colors = ['#ac', '#0000', '#123456zz', '123456', '#12ab3g', '#fff', '#Ffffff'],
            doc = {color: ''};

        for(let i=0,item;item=colors[i];++i) {
          doc.color = item;
          doc[error$] = {};
          TextValidator.color.call(Val, doc,'color');

          assert.equals(doc[error$]['color'],[['is_invalid']]);
        }
      });
    });
  });
});

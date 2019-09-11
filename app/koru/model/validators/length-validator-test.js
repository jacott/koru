define((require, exports, module)=>{
  'use strict';
  /**
   * Validate the length of an object.
   *
   * Enable with {#../../validation.register;(module, LengthValidator)} which is conventionally done
   * in `app/models/model.js`
   **/
  const ValidatorHelper = require('koru/model/validators/validator-helper');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const validation      = require('../validation');

  const {error$} = require('koru/symbols');

  const LengthValidator = require('./length-validator');

  class Book extends ValidatorHelper.ModelStub {
  }
  Book.registerValidator(LengthValidator);

  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{
    group("maxLength", ()=>{
      /**
       * Ensure field is not greater than length.

       * @param len the maximum length of the field
       **/

      before(()=>{
        api.method();
      });

      test("too long", ()=>{
        //[
        Book.defineFields({
          title: {type: 'text', maxLength: 10}
        });
        const book = Book.build({title: 'Animal Farm'});

        refute(book.$isValid());
        assert.equals(book[error$].title, [["too_long", 10]]);
        //]
      });

      test("missing", ()=>{
         Book.defineFields({
          title: {type: 'text', maxLength: 10}
        });
        const book = Book.build();

        assert(book.$isValid());
      });

      test("not too long", ()=>{
        Book.defineFields({
          title: {type: 'text', maxLength: 20}
        });
        const book = Book.build({title: 'Animal Farm'});

        assert(book.$isValid());
      });
    });
  });
});

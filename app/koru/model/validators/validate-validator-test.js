define((require, exports, module)=>{
  'use strict';
  /**
   * Validate field with custom validation function.
   *
   * Enable with {#../../validation.register;(module, ValidateValidator)} which is conventionally done
   * in `app/models/model.js`
   **/
  const Val             = require('koru/model/validation');
  const ValidatorHelper = require('koru/model/validators/validator-helper');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const validation      = require('../validation');

  const {error$} = require('koru/symbols');

  const {stub, spy} = TH;

  const ValidateValidator = require('./validate-validator');

  class Book extends ValidatorHelper.ModelStub {
  }
  Book.registerValidator(ValidateValidator);

  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{
    group("validate", ()=>{
      /**
       * Run `validator` on field (if changed)
       * @param validator A function which has the document as `this` and takes one argument `field`
       * name. If an error is found use {#../../validation.addError} to invalidate document.
       **/

      before(()=>{
        api.method();
      });

      const checkDigit13Valid = (isbn)=>{
        let r = 0;
        for(let i = 0; i < 12; ++i) {
          const d = +isbn[i];
          if (d !== d) {
            r = -1;
            break;
          }
          r += (i % 2) == 0 ? d : 3*d;
        }
        return r !== -1 && +isbn[12] == (10 - (r%10)) % 10;
      };

      test("calls", ()=>{
        //[
        Book.defineFields({
          ISBN: {type: 'text', validate(field) {
            // normalize and validate the ISBN
            const val = this[field];
            if (typeof val === 'string') {
              const norm = val.replace(/-/g, '');
              if (norm.length == 13) {
                if (checkDigit13Valid(norm)) {
                  if (norm !== val) this[field] = norm;
                  return; // is valid
                }
              }
            }

            Val.addError(this, field, 'is_invalid');
          }}
        });
        const book = Book.build({ISBN: '978-3-16-148410-0'});

        assert(book.$isValid());
        assert.equals(book.ISBN, '9783161484100');

        book.ISBN = '222-3-16-148410-0';
        refute(book.$isValid());
        assert.equals(book[error$].ISBN, [['is_invalid']]);
        assert.equals(book.ISBN, '222-3-16-148410-0');
        //]
      });
    });
  });
});

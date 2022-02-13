define((require, exports, module) => {
  'use strict';
  /**
   * TestFactory is used to facilitate building and persisting document {#../base-model;;models} for
   * use within unit tests. A koru system should have a file `app/test/factory.js` which defines the
   * models which TestFactory can use.
   *
   * Model documents are created in the DB using, say, `createBook` for a `Book` or `createAuthor`
   * for an `Author` and are built without saving using, say, `buildBook` for a `Book`. By default
   * documents bypass the validation when created but validation can be done using
   * {#::Builder#useSave}
   **/
  const Model           = require('koru/model');
  const Val             = require('koru/model/validation');
  const RequiredValidator = require('koru/model/validators/required-validator');
  const api             = require('koru/test/api');
  const TH              = require('./test-db-helper');

  const {stub, spy, util, stubProperty, intercept, match: m} = TH;

  const TestFactory = require('./test-factory');

  const Module = module.constructor;

  class Book extends Model.BaseModel {
  }

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    before(() => {
      TH.startTransaction();
      const bm = new Module(void 0, 'book');
      module.onUnload = after;

      Val.register(bm, {RequiredValidator});
      Book.define({module, name: 'Book', fields: {
        title: {type: 'text', required: true}, author: 'text', pages: 'number',
      }});
    });

    after(() => {
      Model._destroyModel('Book', 'drop');
      TH.rollbackTransaction();
    });

    beforeEach(() => {
      api.module({subjectModule: module.get('./test-factory')});
      TH.startTransaction();
    });

    afterEach(() => {
      TH.rollbackTransaction();
    });

    const builderSubject = () => api.innerSubject(TestFactory.Builder, null, {
      abstract() {
        /**
         * A Builder instance is responsible for constructing a model document.
         * See {#.defines}
         **/
      },
    });

    group('Builder', () => {
      let api;
      before(() => {
        api = builderSubject();
      });

      test('addRef', () => {
        /**
         * Add a default reference to another model.

         * @param field The name of the field (without `_id` suffix) to add.

         * @param doc The default document for the field. if-and-only-if a default value is
         * needed then:

         * * if doc is a function the function will be executed and its return result will be used
         to replace `doc`.  Then;

         * * if `undefined` use the last document created for the reference model.

         * * otherwise create a factory default document for the reference.
         */

        class Chapter extends Model.BaseModel {
        }
        Chapter.define({module, name: 'Chapter', fields: {
          number: 'number', book_id: 'belongs_to',
        }});
        after(() => {Model._destroyModel('Chapter', 'drop')});

        after(() => {
          TestFactory.createBook = TestFactory.buildBook = void 0;
        });

        TestFactory.defines({
          Book(options) {
            return new TestFactory.Builder('Book', options)
              .genName('title')
              .addField('pages', 100)
            ;
          },
        });

        api.protoMethod();
        //[
        const book = TestFactory.createBook();

        const builder1 = new TestFactory.Builder('Chapter', {number: 1})
              .addRef('book')
        ;

        assert.equals(builder1.defaults, {book_id: book._id});

        const builder2 = new TestFactory.Builder('Chapter', {book_id: void 0})
              .addRef('book', book)
        ;

        assert.equals(builder2.defaults, {});

        const builder3 = new TestFactory.Builder('Chapter', {number: 1})
              .addRef('book', () => TestFactory.createBook({_id: 'book123'}))
        ;

        assert.equals(builder3.defaults, {book_id: 'book123'});
        //]
      });

      test('create', () => {
        /**
         * Create the document. Called by, say, `Factory.createBook`. See {#.constructor}, {##useSave}
         **/
        api.protoMethod();
        //[
        const builder = new TestFactory.Builder('Book')
        ;

        const book = builder.create();
        assert.equals(book.attributes, {_id: m.id});
        //]
      });

      test('build', () => {
        /**
         * build an unsaved document. Called by, say, `Factory.buildBook`.
         **/
        api.protoMethod();
        //[
        const builder = new TestFactory.Builder('Book')
              .addField('title', 'Winnie-the-Pooh')
        ;

        const book = builder.build();
        assert.equals(book.attributes, {});
        assert.equals(book.changes, {title: 'Winnie-the-Pooh'});
        //]
      });

      test('useSave', () => {
        /**
         * Determine if the normal Model save code should be run.

         * @param value `false` is for the (default) method of bypassing the model validation and
         * inserting document directly into the DB. `true` or `"assert"` is for using
         * {#../base-model#$save;("assert")} and `"force"` is for using
         * {#../base-model#$save;("force")}
         **/
        api.protoMethod();

        const bm = new Module(void 0, 'book');
        module.onUnload = after;

        Val.register(bm, {RequiredValidator});

        //[
        intercept(Book.prototype, 'validate', function () {
          if (this.author === void 0) {
            this.author = 'Anon';
          }
        });

        {
          // no validation
          const builder = new TestFactory.Builder('Book')
                .useSave(false) // the default
          ;

          const book = builder.create();
          assert.equals(book.attributes, {_id: m.id});
        }

        {
          // throw exception if invalid (useSave(true))
          const builder = new TestFactory.Builder('Book')
                .useSave(true)
          ;

          assert.exception(() => {
            const book = builder.create();
          }, {error: 400, reason: {title: [['is_required']]}});
        }

        {
          // force save (useSave('force'))
          const builder = new TestFactory.Builder('Book')
                .useSave('force')
          ;

          const book = builder.create();
          assert.equals(book.attributes, {_id: m.id, author: 'Anon'});
        }
        //]
      });
    });
  });
});

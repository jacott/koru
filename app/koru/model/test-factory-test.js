define((require, exports, module)=>{
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

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    before(()=>{
      TH.startTransaction();
      const bm = new Module(void 0, 'book');
      module.onUnload = after;

      Val.register(bm, {RequiredValidator});
      Book.define({module, name: 'Book', fields: {
        title: {type: 'text', required: true}, author: 'text', pages: 'number'
      }});
    });

    after(()=>{
      Model._destroyModel('Book', 'drop');
      TH.rollbackTransaction();
    });

    beforeEach(()=>{
      TH.startTransaction();
    });

    afterEach(()=>{
      TH.rollbackTransaction();
    });

    test("defines", ()=>{
      /**
       * Defines the models to build and create.

       * @param models Each function in `models` has the name of a model, takes an `options`
       * parameter and returns a {#.Builder}. The `options` parameter will contains an object with
       * field property values and other useful options.
       **/
      api.method();
      after(()=>{
        TestFactory.createBook = TestFactory.buildBook = void 0;
        TestFactory.createAuthor = TestFactory.buildAuthor = void 0;
      });
      //[
      TestFactory.defines({
        Author(options) {
          return new TestFactory.Builder('Author', options);
        },

        Book(options) {
          return new TestFactory.Builder('Book', options)
            .genName('title')
            .addField('pages', 100)
          ;
        }
      });
      const book1 = TestFactory.buildBook();
      assert.same(book1.title, 'Book 1');
      assert.same(book1.author, void 0);
      assert.same(book1.pages, 100);

      const book2 = TestFactory.buildBook({pages: 200, author: 'A. A. Milne'});
      assert.same(book2.author, 'A. A. Milne');
      assert.same(book2.pages, 200);
      //]
    });


    const builderSubject = () => api.innerSubject(TestFactory.Builder, null, {
      abstract() {
        /**
         * A Builder instance is responsible for constructing a model document.
         * See {#.defines}
         **/
      },
    });

    group("Builder", ()=>{
      let api;
      before(()=>{
        api = builderSubject();
      });

      test("constructor", ()=>{
        /**
         * Create a Builder instance for the specified model.

         * @param modelName The name of the model to build.

         * @param attributes The field values to assign to the model

         * @param defaults The field values to use if the field is not in `attributes`
         **/
        stubProperty(TestFactory, 'Builder', {value: api.class()});
        //[
        const builder = new TestFactory.Builder(
          'Book', {title: 'Now We Are Six'}, {author: 'A. A. Milne'})
              .addField('title', 'When We Were Very Young')
              .addField('pages', 112)
        ;

        assert.equals(builder.defaults, {
          author: 'A. A. Milne',
          pages: 112,
        });

        assert.equals(builder.attributes, {title: 'Now We Are Six'});


        assert.equals(builder.makeAttributes(), {
          author: 'A. A. Milne', pages: 112, title: 'Now We Are Six'});
        //]
      });

      test("addField", ()=>{
        /**
         * Add a field to `Builder.defaults`.

         * @param field The name of the field to add.

         * @param value The default value for the field. If value is a function the function will be
         * executed if-and-only-if a default value is needed and its return result will be the value
         * used.
         **/
        api.protoMethod();
        //[
        const builder = new TestFactory.Builder('Book', {title: 'Now We Are Six'});

        builder
          .addField('title', 'When We Were Very Young')
          .addField('isbn', 9780140361230)
          .addField('pages', () => 100 + 12)
        ;

        assert.equals(builder.defaults, {isbn: 9780140361230, pages: 112});
        //]
      });

      test("addRef", ()=>{
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
          number: 'number', book_id: 'belongs_to'
        }});
        after(()=>{Model._destroyModel('Chapter', 'drop')});

        after(()=>{
          TestFactory.createBook = TestFactory.buildBook = void 0;
        });

        TestFactory.defines({
          Book(options) {
            return new TestFactory.Builder('Book', options)
              .genName('title')
              .addField('pages', 100)
            ;
          }
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
              .addRef('book', ()=> TestFactory.createBook({_id: 'book123'}))
        ;

        assert.equals(builder3.defaults, {book_id: 'book123'});
        //]
      });

      test("create", ()=>{
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

      test("build", ()=>{
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

      test("useSave", ()=>{
        /**
         * Determine if the normal Model save code should be run.

         * @param value `false` is for the (default) method of bypassing the model validation and
         * inserting document directly into the DB. `true` is for using {#../base-model.$$save} and
         * `"force"` is for using {#../base-model.$save;("force")}
         **/
        api.protoMethod();

        const bm = new Module(void 0, 'book');
        module.onUnload = after;

        Val.register(bm, {RequiredValidator});

        //[
        intercept(Book.prototype, 'validate', function() {
          if (this.author === void 0)
            this.author = 'Anon';
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

          assert.exception(()=>{
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

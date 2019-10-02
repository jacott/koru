define((require, exports, module)=>{
  'use strict';
  /**
   * Validate the association between two model documents.
   *
   * Enable with {#../../validation.register;(module, AssociatedValidator)} which is conventionally
   * done in `app/models/model.js`
   **/
  const ValidatorHelper = require('koru/model/validators/validator-helper');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const Model           = require('../main');
  const Query           = require('../query');

  const {stub, spy, intercept, stubProperty} = TH;

  const {error$, original$} = require('koru/symbols');

  const AssociatedValidator = require('koru/model/validators/associated-validator');

  class Book extends ValidatorHelper.ModelStub {
  }
  Book.modelName = 'Book';
  class Author extends ValidatorHelper.ModelStub {
  }
  Author.modelName = 'Author';

  Book.registerValidator(AssociatedValidator);
  Author.registerValidator(AssociatedValidator);

  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{
    group("associated", ()=>{
      /**
       * Ensure field contains the id of another model document given certain constraints.
       *
       * {{topic:duplicates not allowed}}
       *

       * @param options `true` is the same as an empty object (`{}`). The following properties are
       * supported:
       *
       * * {{topic:filter}}
       * * {{topic:finder}} {{topic:finder default}}
       *

       * @param type {{topic:belongs_to}}
       *
       * Otherwise the field is expected to be an array of ids
       * {{example:not_found:0}}

       * @param changesOnly {{topic:changesOnly}}

       * @param model {{topic:model}}
       **/

      before(()=>{
        api.method();
        stubProperty(Model, 'Book', {value: Book});
        stubProperty(Model, 'Author', {value: Author});
      });

      const addAuthors = (ids, options)=>{
        const db = new Set(ids);
        const npdb = new Set(options && options.unpublished || []);
        intercept(Query.prototype, 'count', function () {
          const {_id, published=false} = this._wheres;
          let count = 0;
          if (this.model === Author && Array.isArray(_id)) {
            for (const i of new Set(_id)) if (db.has(i) || (! published && npdb.has(i))) ++count;
          }
          return count;
        });

        intercept(Query.prototype, 'forEach', function (callback) {
          const {_id, published} = this._wheres;
          if (this.model == Author && Array.isArray(_id) &&
              util.deepEqual(this._fields, {_id: true})) {
            for (const i of new Set(_id)) {
              (db.has(i) || (! published && npdb.has(i))) && callback({_id: i});
            }
          }
        });
      };

      test("not_found", ()=>{
        /**
         * `true` will test that all ids exist in the associated model
         *
         * {{example:0}}
         **/
        api.topic();
        //[
        addAuthors(['a123', 'a789']);

        Book.defineFields({
          author_ids: {type: 'has_many', associated: true}
        });
        const book = Book.build({author_ids: ['a123', 'a456', 'a789']});

        refute(book.$isValid());
        assert.equals(book[error$].author_ids, [['not_found']]);
        //]
      });

      test("is_invalid", ()=>{
        //[
        // is_invalid
        Book.defineFields({
          author_ids: {type: 'has_many', associated: true}
        });
        const book = Book.build({author_ids: 'a123'}); // not an array

        refute(book.$isValid());
        assert.equals(book[error$].author_ids, [["is_invalid"]]);
        //]
      });

      //[no-more-examples]

      test("filter", ()=>{
        /**
         * `filter` will remove any invalid ids rather than invalidating the document.
         *
         * {{example:0}}
         **/
        api.topic();
        //[
        addAuthors(['a123', 'a789']);

        Book.defineFields({
          author_ids: {type: 'has_many', associated: {filter: true}}
        });
        const book = Book.build({author_ids: ['a123', 'a456', 'a789']});

        assert(book.$isValid());
        assert.equals(book.author_ids, ['a123', 'a789']);
        //]
      });

      test("none", ()=>{
        Book.defineFields({
          author_ids: {type: 'has_many', associated: true}
        });
        const book = Book.build();

        assert(book.$isValid());
      });

      test("changesOnly", ()=>{
        /**
         * When this `fieldOption` is true association only checks for ids which have changed.
         *
         * {{example:0}}
         **/
        api.topic();
        //[
        addAuthors(['a123', 'a789']);
         Book.defineFields({
           author_ids: {type: 'has_many', associated: true, changesOnly: true}
        });
        const book = Book.build();
        book.attributes.author_ids = ['a123', 'badId1', 'badId2'];
        book.author_ids = ['badId1', 'a123', 'a789'];

        assert(book.$isValid()); // new id 'a789' exists

        book.author_ids = ['badId3', 'a123', 'a789'];

        refute(book.$isValid()); // new id 'badId3' not found
        assert.equals(book[error$].author_ids, [['not_found']]);
        //]
      });

      group("duplicates not allowed", ()=>{
        /**
         * Duplicates are not allowed. Ids will be arranged in ascending order.
         *
         * {{example:0}}
         *
         * If `filter` is true duplicates will be removed
         *
         * {{example:1}}
         **/
        before(()=>{
          api.topic();
        });

        test("unfiltered", ()=>{
          //[
          addAuthors(['a123', 'a789']);
          Book.defineFields({
            author_ids: {type: 'has_many', associated: true}
          });

          const book = Book.build({author_ids: ['a123', 'a789', 'a123']});
          refute(book.$isValid());
          assert.equals(book[error$].author_ids, [['duplicates']]);
          assert.equals(book.author_ids, ['a123', 'a123', 'a789']);
          //]
        });

        test("filtered", ()=>{
          //[
          addAuthors(['a123', 'a789']);
          Book.defineFields({
            author_ids: {type: 'has_many', associated: {filter: true}}
          });

          const book = Book.build({author_ids: ['a123', 'a789', 'a123']});
          assert(book.$isValid());
          assert.equals(book.author_ids, ['a123', 'a789']);
          //]
        });

        test("filtered changesOnly", ()=>{
          addAuthors(['a123', 'a789']);
          Book.defineFields({
            author_ids: {type: 'has_many', associated: {filter: true}, changesOnly: true}
          });

          const book = Book.build({author_ids: ['a123', 'a789', 'a123']});
          book.attributes.author_ids = ['bad1'];

          assert(book.$isValid());
          assert.equals(book.author_ids, ['a123', 'a789']);
        });
      });

      test("finder", ()=>{
        /**
         * `finder` is a function that is called with the document as `this` and the ids to check as
         * the first argument.
         *
         * {{example:0}}
         **/
        api.topic();
        //[
        addAuthors(['a123', 'a789'], {unpublished: ['a456']});
        Book.defineFields({
          author_ids: {type: 'has_many', associated: {finder(values) {
            return Author.where('published', this.published).where('_id', values);
          }}},
          published: {type: 'boolean'},
        });

        const book = Book.build({author_ids: ['a123', 'a456']});
        assert(book.$isValid());

        const book2 = Book.build({author_ids: ['a123', 'a456'], published: true});
        refute(book2.$isValid());
        //]
      });

      test("finder default", ()=>{
        /**
         * If the document has a prototype method named `<field-name-sans/_ids?/>Find` then it will
         * be used to scope the query unless `finder` is present.
         *
         * {{example:0}}
         **/
        api.topic();
        //[
        addAuthors(['a123', 'a789'], {unpublished: ['a456']});

        function authorFind(values) {
          return Author.where('published', this.published).where('_id', values);
        }

        Book.defineFields({
          author_ids: {type: 'has_many', associated: true},
          published: {type: 'boolean'},
        });

        const book = Book.build({author_ids: ['a123', 'a456']});
        assert(book.$isValid());
        book.authorFind = authorFind;
        assert(book.$isValid());

        const book2 = Book.build({author_ids: ['a123', 'a456'], published: true});
        assert(book2.$isValid());
        book2.authorFind = authorFind;
        refute(book2.$isValid());
        //]
      });

      test("model", ()=>{
        /**
         * A `model` will override the associated model.
         *
         * {{example:0}}
         **/
        api.topic();
        //[
        addAuthors(['a123', 'a789']);

        Book.defineFields({
          authors: {type: 'has_many', associated: true, model: Author}
        });
        const book = Book.build({authors: ['a123']});

        assert(book.$isValid());

        const book2 = Book.build({authors: ['a456']});
        refute(book2.$isValid());
        //]
      });

      test("belongs_to", ()=>{
        /**
         * When the field `type` is `'belongs_to'` the field value must be a string containing the
         * id of an association document.
         *
         * {{example:0}}
         **/
        api.topic();
        //[
        addAuthors(['a123']);

        Book.defineFields({
          author_id: {type: 'belongs_to', associated: true}
        });
        const book = Book.build({author_id: 'wrongId'});

        refute(book.$isValid());
        assert.equals(book[error$].author_id, [['not_found']]);

        book.author_id = 'a123';
        assert(book.$isValid());
        //]
      });
    });
  });
});

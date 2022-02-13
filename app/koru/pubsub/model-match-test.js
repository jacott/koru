define((require, exports, module) => {
  'use strict';
  /**
   * A class to create a match registry that compares a {#koru/model/main} document to a set of
   * match functions.
   *
   * Used in {#../subscription}
   *
   **/
  const BaseModel       = require('koru/model/base-model');
  const Model           = require('koru/model/main');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const ModelMatch = require('./model-match');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    class Book extends BaseModel {
      static get modelName() {return 'Book'}
      static fetch() {
        return new Book();
      }
    }

    test('constructor', () => {
      /**
       * Create a ModelMatch registry.
       **/
      const ModelMatch = api.class();

      const myMatch = new ModelMatch();

      assert(myMatch.register);
    });

    test('register', () => {
      /**
       * Register a matcher agains a model.
       *
       * See also {##has}, {#../subscription#match}

       * @param modelName or model

       * @param comparator The `comparator(doc){}` should take one argument `doc`to test if matches.
       * Return `true` to match the document, `false` to explicitly not match the document and
       * `undefined` if no opinion about the document. See {##has}

       * @return `handle` with `delete` method to unregister the `comparator`.
       **/
      api.protoMethod();
      //[
      const myMatch = new ModelMatch();
      const book1 = Book.fetch();
      const book2 = Book.fetch();
      const book3 = Book.fetch();

      const comparator = (doc) => doc === book1 || (doc === book2 ? false : void 0);
      const m1 = myMatch.register('Book', comparator);

      assert.isTrue(myMatch.has(book1));
      assert.isFalse(myMatch.has(book2));
      assert.same(myMatch.has(book3), void 0);
      //]
    });

    test('has', () => {
      /**
       * Test if a document matches a matcher. See {##register}.

       * @param doc the document to test if matches a matcher

       * @return `true`, `false`, or `undefined`.

       * 1. `true` if the `doc` matches any matcher. No further matchers are tested.

       * 1. `false` if at least one matcher returns `false` and no matcher returns `true`. `false`
       * indicates that this document should be removed both from memory and client persistent
       * storage.

       * 1. `undefined` if all matchers return `undefined` or no matchers are
       * registered. `undefined` indicates that this document should be removed from memory but not
       * from client persistent storage. Incoming changes from a server which match `undefined` will
       * notify [model](#koru/model/base-model) observers with a {#koru/model/doc-change.delete}
       * flag of "stopped".
       **/

      api.protoMethod();
      //[
      const myMatch = new ModelMatch();
      const book1 = Book.fetch();
      const book2 = Book.fetch();
      const book3 = Book.fetch();

      assert.same(myMatch.has(book1), void 0);

      const m1 = myMatch.register('Book', (doc) => {});

      assert.same(myMatch.has(book1), void 0);

      const m2 = myMatch.register('Book', (doc) => {
        return doc === book1 ? true : void 0;
      });

      const m3 = myMatch.register('Book', (doc) => {
        return doc === book2;
      });

      assert.isTrue(myMatch.has(book1));
      assert.isTrue(myMatch.has(book2));
      assert.isFalse(myMatch.has(book3));

      m3.delete();

      assert.isTrue(myMatch.has(book1));
      assert.same(myMatch.has(book2), void 0);
      //]
    });
  });
});

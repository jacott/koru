define((require, exports, module)=>{
  /**
   * A Factory method to create a match registry that compares a
   * {#koru/model/main} record to a set of match functions.
   *
   * Used in {#koru/session/publish}
   *
   **/
  const dbBroker = require('koru/model/db-broker');
  const Model    = require('koru/model/main');
  const api      = require('koru/test/api');
  const util     = require('koru/util');
  const TH       = require('./test-helper');

  const Match = require('./match');

  let v = {};

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    class Book {
      static get modelName() {return 'Book'}
      static fetch() {
        return new Book();
      }
    }

    beforeEach( ()=>{
      v.handles = [];
    });

    afterEach( ()=>{
      v.handles.forEach(h =>{h.delete()});
      dbBroker.clearDbId();
      v = {};
    });

    test("new", ()=>{
      /**
       * Create a match registry. Do not use this directly; instead use it inside a
       * {#koru/session/publish} body
       **/
      const new_Match = api.new();

      const myMatch = new_Match();

      assert(myMatch.register);
    });

    test("register", ()=>{
      /**
       * Register a matcher agains a model. See also {##has}

       * @param modelName or model

       * @param comparator The `comparator(doc, reason){}` should take one or two arguments. The
       * first is the `doc` to test if matches and the second [client side only] is a `reason` for
       * testing. Return `true` to match the document otherwise `false`.
       *
       * The `reason` is usally `undefined` but will be set to `"stopped"` when a subscription is
       * stopped. Use the `reason` to determine if the `doc` should be fully deleted from the client
       * or just unloaded from memory. For instance when the `reason` is `"stopped"` the matcher can
       * return false if the subscription has finished with the document but should not be deleted
       * from offline storage.
       **/
      api.protoMethod();
      //[
      const myMatch = new Match();
      const book1 = Book.fetch();
      const book2 = Book.fetch();

      // no matchers match the document if stopped
      const m1 = myMatch.register('Book', (doc, reason)=>{
        return reason === 'stopped' ? doc === book1 : true;
      });

      //]
      v.handles.push(m1);
      //[
      assert.isTrue(myMatch.has(book2));
      assert.isFalse(myMatch.has(book2, "stopped"));
      assert.isTrue(myMatch.has(book1, "stopped"));
      //]
    });

    test("has", ()=>{
      /**
       * Test if a document matches a matcher. See {##register}. (This is not usally called
       * directly).

       * @param doc the document to test if matches a matcher

       * @param reason [client side only] `"stopped"` when a subscription is stopped; noMatch if
       * `userId` changes.
       **/

      api.protoMethod();
      //[
      const myMatch = new Match();
      const book1 = Book.fetch();
      const book2 = Book.fetch();
      const book3 = Book.fetch();

      const m1 = myMatch.register('Book', (doc, reason)=>{
        return reason === 'stopped' ? doc !== book1 : true;
      });

      const m2 = myMatch.register('Book', doc => {
        return doc === book2;
      });

      //]
      v.handles.push(m1, m2);
      //[

      assert.isTrue(myMatch.has(book1));
      assert.isFalse(myMatch.has(book1, "stopped"));
      assert.isTrue(myMatch.has(book2, "stopped"));
      assert.isTrue(myMatch.has(book3, "stopped"));

      m1.delete();

      assert.isFalse(myMatch.has(book1));
      assert.isTrue(myMatch.has(book2));
      assert.isFalse(myMatch.has(book3));
      m2.delete();

      assert.isFalse(myMatch.has(book2));
      //]
    });
  });
});

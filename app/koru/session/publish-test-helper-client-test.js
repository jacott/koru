define((require, exports, module)=>{
  /**
   * Utilities to help test client publish/subscribe
   **/

  const publish         = require('koru/session/publish');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const publishTH       = require('./publish-test-helper-client');

  const {stubProperty, stub} = TH;

  let v = {};
  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{
    before(()=>{
      api.module({subjectName: 'publishTH'});
    });

    test("mockSubscribe", ()=>{
      /**
       * Subscribe to a publication but do not call server.
       **/
      api.method('mockSubscribe');
      const FooStub = stub();
      stubProperty(publish._pubs, "Foo", {value: {init: FooStub}});
      const sub = publishTH.mockSubscribe("Foo", 1, 2);
      assert(sub);
      assert(sub._mockMatches);
      assert.calledWith(FooStub, 1, 2);
      assert.same(FooStub.firstCall.thisValue, sub);
    });

    test("MockClientSub#match", ()=>{
      /**
       * Record the match calls in a client publish function in
       * `#_mockMatches`.
       *
       * See {#koru/session/client-sub}
       **/
      function abstract() {
        /**
         * MockClientSub replaces {#koru/session/client-sub};
         * the return from {#koru/session/subscribe}
         **/
      }
      stubProperty(publish._pubs, "books", {value: {init() {}}});
      const sub = publishTH.mockSubscribe("books", 1, 2);
      const iapi = api.innerSubject(sub.constructor, null, {
        abstract,
        initInstExample() {
        },
      });

      iapi.protoMethod('match');
      //[
      {
        const sub = publishTH.mockSubscribe("books");

        class Book {
          constructor(name) {
            this.name = name;
          }
        }
        sub.match(Book, book => {
          return /é/.test(book.name);
        });
        assert.isTrue(sub._mockMatches.get(Book)({name: 'Les Misérables'}));
        assert.isFalse(sub._mockMatches.get(Book)({name: 'The Bluest Eye'}));
      }//]
    });
  });
});

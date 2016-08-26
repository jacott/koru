define(function (require, exports, module) {
  /**
   * Utilities to help test client publish/subscribe
   **/
  var test, v;
  const publish   = require('koru/session/publish');
  const api       = require('koru/test/api');
  const TH        = require('koru/test/main');
  const publishTH = require('./publish-test-helper-client');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      api.module(null, 'publishTH');
    },

    tearDown() {
      v = null;
    },

    "test mockSubscribe"() {
      /**
       * Subscribe to a publication but do not call server.
       **/
      api.method('mockSubscribe');
      const FooStub = test.stub();
      TH.stubProperty(publish._pubs, "Foo", FooStub);
      const sub = publishTH.mockSubscribe("Foo", 1, 2);
      assert(sub);
      assert(sub._mockMatches);
      assert.calledWith(FooStub, 1, 2);
      assert.same(FooStub.firstCall.thisValue, sub);
    },

    "test MockClientSub#match"() {
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
      TH.stubProperty(publish._pubs, "books", function () {});
      const sub = publishTH.mockSubscribe("books", 1, 2);
      const iapi = api.innerSubject(sub.constructor, null, {
        abstract,
        initInstExample() {
        },
      });

      iapi.protoMethod('match');
      iapi.example(() => {
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
      });
    },
  });
});

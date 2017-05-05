isClient && define(function (require, exports, module) {
  /**
   * A subscription to a publication
   *
   * ##### Construction
   *
   * See {#koru/session/subscribe}
   **/
  const Model        = require('koru/model');
  const publish      = require('koru/session/publish');
  const api          = require('koru/test/api');
  const stateFactory = require('./state').constructor;
  const TH           = require('./test-helper');

  const ClientSub    = require('./client-sub');
  var test, v;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      v.sess = {
        provide: test.stub(),
        state: v.sessState = stateFactory(),
        _rpcs: {},
        _commands: {},
        sendBinary: v.sendBinary = test.stub(),
        subs: {},
      };
      const subscribe = function () {};
      api.module(null, null, {
        initInstExample: `
          const subscribe = ${'require'}('koru/session/subscribe');
          const clientSub = subscribe("Library");`
      });
    },

    tearDown() {
      v = null;
    },

    "test onResponse"() {
      /**
       * Use this instead of passing a callback to subscribe to be notified each time the server
       * responds to a connection request.
       *
       * See also {##onFirstResponse}
       *
       * @param callback first arg is an error is subscribe failed
       **/
      api.protoMethod('onResponse');
      const sub = new ClientSub(v.sess, "1", "Library", []);
      sub.onResponse(v.cb = this.stub());
      sub._wait();
      assert.isTrue(sub.waiting);

      sub._received();
      assert.isFalse(sub.waiting);
      assert.calledOnceWith(v.cb, null);

      sub._wait();
      sub._received();
      assert.calledTwice(v.cb);

      sub._wait();
      sub._received('error');
      assert.calledThrice(v.cb);
      assert.calledWith(v.cb, 'error');

      sub._wait();
      sub._received('error');
      assert.calledThrice(v.cb);
    },

    "test onFirstResponse"() {
      /**
       * Same as passing a callback to subscribe to be notified the first time the server responds
       * to a connection request.
       *
       * See also {##onResponse}
       *
       * @param callback first arg is an error is subscribe failed
       **/
      api.protoMethod('onFirstResponse');
      const sub = new ClientSub(v.sess, "1", "Library", []);
      sub.onFirstResponse(v.cb = this.stub());
      sub._wait();
      assert.isTrue(sub.waiting);

      sub._received();
      assert.isFalse(sub.waiting);
      assert.calledOnceWith(v.cb, null);

      sub._wait();
      sub._received();
      assert.calledOnce(v.cb);
    },

    "test #match"() {
      /**
       * Register a match function used to check if a document should
       * be in the database.
       **/
      api.protoMethod('match');

      class Book extends Model.BaseModel {
      }

      const regBook = test.stub(publish.match, "register").withArgs(Book, TH.match.func)
              .returns("registered Book");
      const sub1 = new ClientSub(v.sess, "1", "Library", []);


      sub1.match(Book, doc => /lord/i.test(doc.name));

      assert.equals(sub1._matches, ['registered Book']);
      assert.isTrue(regBook.args(0, 1)({name: "Lord of the Flies"}));
    },

    "test filterModels"() {
      /**
       * Remove model documents that do not match this subscription
       **/
      api.protoMethod('filterModels');

      test.stub(publish, '_filterModels');
      var sub1 = new ClientSub(v.sess, "1", "Library", []);

      sub1.filterModels('Book', 'Catalog');

      assert.calledWithExactly(publish._filterModels, {Book: true, Catalog: true});
    },
  });
});

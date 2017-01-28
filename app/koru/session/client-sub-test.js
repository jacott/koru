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

      assert.calledWith(publish._filterModels, {Book: true, Catalog: true});
    },
  });
});

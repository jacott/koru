define(function (require, exports, module) {
  /**
   * A subscription to a publication
   *
   * ##### Construction #####
   *
   * See {#koru/session/subscribe}
   **/
  var test, v;
  const publish      = require('koru/session/publish');
  const api          = require('koru/test/api');
  const ClientSub    = require('./client-sub');
  const stateFactory = require('./state').constructor;
  const TH           = require('./test-helper');

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
          const clientSub = subscribe("Library");
`
      });
    },

    tearDown() {
      v = null;
    },

    "test filterModels": function () {
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

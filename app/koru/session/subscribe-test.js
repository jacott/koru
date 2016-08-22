isClient && define(function (require, exports, module) {
  /**
   * Main publication subscriber. An instance of
   * [subscribeFactory](#koru/session/subscribe-factory) on the
   * [main session](#koru/session/main)
   **/
  var test, v;
  const session   = require('koru/session');
  const ClientSub = require('koru/session/client-sub');
  const publish   = require('koru/session/publish');
  const api       = require('koru/test/api');
  const subscribe = require('./subscribe');
  const TH        = require('./test-helper');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      api.module();
    },

    tearDown() {
      v = null;
    },

    "test wired correctly"() {
      TH.stubProperty(publish._pubs, 'Foo', v.Foo = test.stub());
      const sub = subscribe('Foo', 'x');
      assert.same(sub.constructor, ClientSub);
      assert.same(sub.session, session);

      assert.calledWith(v.Foo, 'x');
    },
  });
});

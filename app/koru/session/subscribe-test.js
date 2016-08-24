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
      /**
       * Subscribe to a publication (see {#koru/session/publish}).
       *
       * @param name the name of the publication

       * @param {[anything...]} [args] a list of arguments to send to
       * the publication.
       *
       * The last argument can be a `callback` which will be called
       * after the subscription has received the initial data from the
       * publication. If an error occured the error object will be
       * passed to the callback.
       **/
      TH.stubProperty(session, 'interceptSubscribe', function () {return true});
      TH.stubProperty(publish._pubs, 'Books', v.Foo = test.stub());
      api.new(subscribe);
      api.example(() => {
        const sub = subscribe('Books', {author: 'Jane Austen'}, error => {
          console.error("got error " + error);
        });
        assert.same(sub.constructor, ClientSub);
      });
    },
  });
});

isClient && define((require, exports, module)=>{
  /**
   * Main publication subscriber. An instance of
   * [subscribeFactory](#koru/session/subscribe-factory) on the
   * [main session](#koru/session/main)
   **/
  const session   = require('koru/session');
  const ClientSub = require('koru/session/client-sub');
  const publish   = require('koru/session/publish');
  const api       = require('koru/test/api');
  const TH        = require('./test-helper');

  const {stub, spy, onEnd, stubProperty} = TH;

  const subscribe = require('./subscribe');

  let v = null;

  TH.testCase(module, {
    setUp() {
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

       * @param {...any-type} [args] a list of arguments to send to
       * the publication.
       *
       * The last argument can be a `callback` which will be called
       * after the subscription has received the initial data from the
       * publication. If an error occured the error object will be
       * passed to the callback.
       **/
      stubProperty(session, 'interceptSubscribe', ()=> true);
      stubProperty(publish._pubs, 'Books', stub());
      const sut = subscribe;
      {
        const subscribe = api.custom(sut);
        //[
        const sub = subscribe('Books', {author: 'Jane Austen'}, error => {
          if (error) console.error("got error " + error);
        });
        assert.same(sub.constructor, ClientSub);
        //]
      }
    },
  });
});

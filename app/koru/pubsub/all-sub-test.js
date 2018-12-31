isClient && define((require, exports, module)=>{
  /**
   * AllSub is an extended {#../subscription} which will subscribe to all documents in
   * every defined {#koru/model/main}.
   *
   * See Also {#../all-pub}
   **/
  const ModelMap        = require('koru/model/map');
  const TH              = require('koru/model/test-db-helper');
  const Subscription    = require('koru/pubsub/subscription');
  const api             = require('koru/test/api');

  const {stub, spy, onEnd} = TH;

  const AllSub = require('./all-sub');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("subscribe", ()=>{
      /**
       * Subscribe to all models in {#koru/models/model-map}
       **/
      api.method();
      onEnd(()=>{
        delete ModelMap.Book;
        delete ModelMap.Author;
      });
      ModelMap.Author = true; ModelMap.Book = true;
      const connect = stub(Subscription.prototype, 'connect');
      const match = stub(Subscription.prototype, 'match');

      //[
      const sub = AllSub.subscribe();
      //]

      assert.calledOnce(connect);

      assert.same(match.firstCall.thisValue, sub);
      assert.same(connect.firstCall.thisValue, sub);

      assert.calledWith(match, 'Book');
      assert.calledWith(match, 'Author');

      assert.isTrue(match.firstCall.args[1]());
      assert.isTrue(match.lastCall.args[1]({}));
    });
  });
});

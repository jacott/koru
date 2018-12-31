define((require, exports, module)=>{
  const ModelMap        = require('koru/model/map');
  const Subscription    = require('koru/pubsub/subscription');

  const truth = ()=> true;

  class AllSub extends Subscription {
    connect() {
      // FIXME need to be able to make all as simulated if connection lost since we use full reload
      // see FIXME in query-client
      for (const name in ModelMap) this.match(name, truth);
      super.connect();
    }
  }
  AllSub.module = module;

  return AllSub;
});

define((require, exports, module)=>{
  const Subscription    = require('koru/pubsub/subscription');

  const $$modelName$$ = require('models/$$modelModule$$');

  class $$publishName$$Sub extends Subscription {
    connect() {
      this.match($$modelName$$, ()=> true);
      super.connect();
    }

    simulateMatchingDocuments() {
      $$modelName$$.query.forEach(Subscription.markSimulatedAdd);
    }
  }
  $$publishName$$Sub.module = module;

  return $$publishName$$Sub;
});

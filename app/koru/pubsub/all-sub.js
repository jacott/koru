define((require, exports, module)=>{
  const ModelListMixin  = require('koru/pubsub/model-list-mixin');
  const Subscription    = require('koru/pubsub/subscription');

  const config$ = Symbol();

  const truth = ()=> true;

  class AllSub extends ModelListMixin(Subscription) {
    connect(...args) {
      for (const model of this.constructor.includedModels()) {
        this.match(model.modelName, truth);
      }
      super.connect(...args);
    }

    reconnecting() {
      for (const model of this.constructor.includedModels()) {
        model.query.forEach(Subscription.markForRemove);
      }
    }
  }
  AllSub.module = module;
  AllSub.resetModelList();

  return AllSub;
});

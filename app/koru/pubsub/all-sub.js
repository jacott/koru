define((require, exports, module) => {
  'use strict';
  const ModelListMixin  = require('koru/pubsub/model-list-mixin');
  const Subscription    = require('koru/pubsub/subscription');

  const config$ = Symbol();

  const tautology = () => true;

  class AllSub extends ModelListMixin(Subscription) {
    constructor() {
      super();
      for (const model of this.constructor.includedModels()) {
        this.match(model.modelName, tautology);
      }
    }

    stopped(unmatch) {
      for (const model of this.constructor.includedModels()) {
        model.query.forEach(unmatch);
      }
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

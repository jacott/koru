define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const DLinkedList     = require('koru/dlinked-list');
  const LinkedList      = require('koru/linked-list');
  const DocChange       = require('koru/model/doc-change');
  const Val             = require('koru/model/validation');
  const ModelListMixin  = require('koru/pubsub/model-list-mixin');
  const Publication     = require('koru/pubsub/publication');
  const Union           = require('koru/pubsub/union');
  const message         = require('koru/session/message');
  const util            = require('koru/util');

  const config$ = Symbol();

  const {hasOwn} = util;

  class AllUnion extends Union {
    constructor(pubClass) {
      super();
      this.pubClass = pubClass;
    }

    initObservers() {
      const {handles} = this;

      for (const model of this.pubClass.includedModels()) {
        handles.push(this.onChange(model, this.batchUpdate));
      }
    }

    onChange(model, batchUpdate) {
      return model.onChange(batchUpdate);
    }

    async loadInitial(encoder) {
      const addDoc = encoder.addDoc.bind(encoder);
      for (const model of this.pubClass.includedModels()) {
        await model.query.forEach(addDoc);
      }
    }
  }

  class AllPub extends ModelListMixin(Publication) {
    constructor(options) {
      super(options);
      const {constructor} = this;
      constructor.requireUserId && Val.allowAccessIf(this.userId);
    }

    async init() {
      const {constructor} = this;
      await (constructor.union ||
             (constructor.union = new constructor.Union(constructor))).addSub(this);
    }

    stop() {
      super.stop();
      const {union} = this.constructor;
      union !== undefined && union.removeSub(this);
    }

    static resetConfig() {
      this.requireUserId = false;
      super.resetModelList();
    }
  }
  AllPub.resetConfig();
  AllPub.Union = AllUnion;
  AllPub.union = undefined;

  return AllPub;
});

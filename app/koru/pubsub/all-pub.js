define((require, exports, module)=>{
  const koru            = require('koru');
  const DLinkedList     = require('koru/dlinked-list');
  const LinkedList      = require('koru/linked-list');
  const DocChange       = require('koru/model/doc-change');
  const TransQueue      = require('koru/model/trans-queue');
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

    loadInitial(encoder) {
      const addDoc = encoder.addDoc.bind(encoder);
      for (const model of this.pubClass.includedModels()) {
        model.query.forEach(addDoc);
      }
    }
  }

  class AllPub extends ModelListMixin(Publication) {
    constructor(options) {
      super(options);
      const {constructor} = this;
      constructor.requireUserId && Val.allowAccessIf(this.userId);
    }

    init() {
      const {constructor} = this;
      (constructor.union ||
       (constructor.union = new constructor.Union(constructor))
      ).addSub(this);
    }

    stop() {
      super.stop();
      const {union} = this.constructor;
      union !== void 0 && union.removeSub(this);
    }

    static resetConfig() {
      this.testDoc = null;
      this.requireUserId = false;
      super.resetModelList();
    }
  }
  AllPub.module = module;
  AllPub.resetConfig();
  AllPub.Union = AllUnion;
  AllPub.union = void 0;

  return AllPub;
});

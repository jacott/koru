define((require, exports, module)=>{
  const koru            = require('koru');
  const DLinkedList     = require('koru/dlinked-list');
  const LinkedList      = require('koru/linked-list');
  const DocChange       = require('koru/model/doc-change');
  const ModelMap        = require('koru/model/map');
  const TransQueue      = require('koru/model/trans-queue');
  const Val             = require('koru/model/validation');
  const Publication     = require('koru/pubsub/publication');
  const message         = require('koru/session/message');
  const util            = require('koru/util');

  const config$ = Symbol(),
        handles$ = Symbol();

  const config = (obj)=> obj[config$] || (obj.resetConfig(), obj[config$]);

  class AllUnion extends Publication.Union {
    constructor(pubClass) {
      super(pubClass);
    }

    stopListeners() {
      super.stopListeners();
      for (const handle of this[handles$])
        handle.stop();
    }

    initObservers(batchUpdate=this.buildBatchUpdate()) {
      this[handles$] = [];

      const {excludeModels} = config(this.pubClass);

      for (const name in ModelMap) {
        if (excludeModels[name] !== void 0) continue;
        const model = ModelMap[name];
        if (model.query === void 0) continue;
        this[handles$].push(model.onChange(batchUpdate));
      }
    }

    loadInitial(addDoc) {
      const {excludeModels} = config(this.pubClass);

      for (const name in ModelMap) {
        if (excludeModels[name] !== void 0) continue;
        const model = ModelMap[name];
        if (model.query === void 0) continue;
        model.query.forEach(addDoc);
      }
    }
  }

  class AllPub extends Publication {
    constructor(options) {
      super(options);
      config(this.constructor).requireUserId && Val.allowAccessIf(this.userId);
    }

    init() {
      const {constructor} = this;
      (constructor.union ||
       (constructor.union = new constructor.Union(constructor, this.conn._session))
      ).addSub(this);
    }

    stop() {
      super.stop();
      const {union} = this.constructor;
      union !== void 0 && union.removeSub(this);
    }

    static resetConfig() {
      this[config$] = {
        requireUserId: false,
        excludeModels: {UserLogin: true},
      };
    }

    static get requireUserId() {return config(this).requireUserId}
    static set requireUserId(value) {config(this).requireUserId = !! value}

    static isModelExcluded(name) {return config(this).excludeModels[name] !== void 0}
    static excludeModel(...names) {
      for (const name of names) config(this).excludeModels[name] = true;
    }

    // TODO
    // static get updatesOnly() {return config(this).updatesOnly}
    // static set updatesOnly(value) {config(this).updatesOnly = !! value}
  }
  AllPub.Union = AllUnion;

  return AllPub;
});

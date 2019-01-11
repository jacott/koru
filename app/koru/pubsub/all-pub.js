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

  const config$ = Symbol(), testDoc$ = Symbol(),
        handles$ = Symbol();

  const {hasOwn} = util;

  const config = (obj)=> hasOwn(obj, config$) ?
      obj[config$]
        : (obj[config$] === void 0 ?
           obj.resetConfig() :
           obj[config$] = Object.assign({}, obj[config$]));

  class AllUnion extends Publication.Union {
    constructor(pubClass) {
      super(pubClass);
    }

    stopListeners() {
      super.stopListeners();
      for (const handle of this[handles$])
        handle.stop();
    }

    initObservers() {
      this[handles$] = [];

      let batchUpdate=this.buildBatchUpdate();

      const {excludeModels, includeModels} = config(this.pubClass);

      for (const name in util.isObjEmpty(includeModels) ? ModelMap : includeModels) {
        if (excludeModels[name] !== void 0) continue;
        const model = ModelMap[name];
        if (model.query === void 0) continue;
        this[handles$].push(model.onChange(batchUpdate));
      }
    }

    loadInitial(addDoc, discreteLastSubscribed) {
      const {excludeModels, includeModels, loadInitial} = config(this.pubClass);

      for (const name in util.isObjEmpty(includeModels) ? ModelMap : includeModels) {
        if (excludeModels[name] !== void 0) continue;
        const model = ModelMap[name];
        if (model.query === void 0) continue;
        const {query} = model;
        if (loadInitial !== void 0) {
          loadInitial.whereUpdated(query, discreteLastSubscribed);
        }
        query.forEach(addDoc);
      }
    }
  }

  class AllPub extends Publication {
    constructor(options) {
      super(options);
      const cfg = config(this.constructor);
      cfg.requireUserId && Val.allowAccessIf(this.userId);
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

    static buildUpdate(dc) {
      const testDoc = this[testDoc$];
      if (testDoc === null) return super.buildUpdate(dc);
      const {doc, model: {modelName}} = dc;
      if (dc.isAdd) {
        if (! testDoc(dc.doc)) return;
        return ['A', [modelName, doc._id, doc.attributes]];
      } else if (dc.isDelete) {
        if (! testDoc(dc.was)) return;
        return ['R', [modelName, doc._id]];
      } else  {
        const wasHere = testDoc(dc.was), isHere = testDoc(dc.doc);
        if (wasHere) {
          if (isHere) return ['C', [modelName, doc._id, dc.changes]];
          else return ['R', [modelName, doc._id]];
        } else if (isHere) {
          return ['A', [modelName, doc._id, doc.attributes]];
        }
      }
    }

    static resetConfig() {
      this.testDoc = null;
      return this[config$] = {
        requireUserId: false,
        excludeModels: {UserLogin: true},
        includeModels: {},
      };
    }

    static get requireUserId() {return config(this).requireUserId}
    static set requireUserId(value) {config(this).requireUserId = !! value}

    static isModelExcluded(name) {
      const cfg = config(this);
      if (util.isObjEmpty(cfg.includeModels))
        return cfg.excludeModels[name] !== void 0;
      return cfg.includeModels[name] === void 0;
    }

    static excludeModel(...names) {
      const cfg = config(this);
      cfg.includeModels = {};
      for (const name of names) cfg.excludeModels[name] = true;
    }

    static includeModel(...names) {
      const cfg = config(this);
      cfg.excludeModels = {};
      for (const name of names) cfg.includeModels[name] = true;
    }

    static get loadInitialConfig() {return config(this).loadInitial}
    static set loadInitialConfig(v) {
      const cfg = config(this);
      cfg.loadInitial = v;
      this[testDoc$] = null;
      if (cfg.loadInitial !== void 0) {
        this[testDoc$] = cfg.loadInitial.test;
      }

    }
  }
  AllPub.Union = AllUnion;
  AllPub[testDoc$] = null;

  return AllPub;
});

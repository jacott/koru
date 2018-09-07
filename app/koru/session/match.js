define((require)=>{
  const DLinkedList     = require('koru/dlinked-list');
  const dbBroker        = require('koru/model/db-broker');

  const dbs$ = Symbol();

  class Match {
    constructor() {this[dbs$] = Object.create(null)}

    get _models() {return this[dbs$][dbBroker.dbId]}

    has(doc) {
      const models = this._models;
      if (models === undefined) return false;
      const mm = models[doc.constructor.modelName];
      if (mm === undefined) return false;
      for (const comparator of mm) {
        if (comparator(doc)) return true;
      }
      return false;
    }

    register(modelName, comparator) {
      const dbs = this[dbs$];
      const {dbId} = dbBroker;
      modelName = typeof modelName === 'string' ? modelName : modelName.modelName;

      const models = dbs[dbId] || (dbs[dbId] = Object.create(null));
      const matchFuncs = models[modelName] || (models[modelName] = new DLinkedList());
      const handle = matchFuncs.add(comparator);
      handle.modelName = modelName;
      return handle;
    }
  }

  return Match;
});

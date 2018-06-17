define(function(require) {
  const dbBroker = require('koru/model/db-broker');

  const dbs$ = Symbol(), key$ = Symbol();

  class StopFunc {
    constructor(dbs, dbId, modelName, id) {
      this.dbs = dbs;
      this.dbId = dbId;
      this.modelName = modelName;
      this.id = id;
    }

    stop() {
      if (this.id === null) return;
      const matchFuncs = this.dbs[this.dbId][this.modelName];
      delete matchFuncs[this.id];
      this.id = null;
    }
  }

  class Match {
    constructor() {
      this[dbs$] = {};
      this[key$] = 0;
    }

    get _models() {return this[dbs$][dbBroker.dbId]}

    has(doc) {
      const models = this[dbs$][dbBroker.dbId];
      const mm = models === undefined ? undefined : models[doc.constructor.modelName];
      for (const key in mm) if (mm[key](doc)) return true;
      return false;
    }

    register(modelName, comparator) {
      const dbs = this[dbs$];
      const {dbId} = dbBroker;
      modelName = typeof modelName === 'string' ? modelName : modelName.modelName;
      const id = (++this[key$]).toString(36);

      const models = dbs[dbId] || (dbs[dbId] = {});
      const matchFuncs = models[modelName] || (models[modelName] = Object.create(null));
      matchFuncs[id] = comparator;

      return new StopFunc(dbs, dbId, modelName, id);
    }
  }

  return Match;
});

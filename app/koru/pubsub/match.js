define((require)=>{
  const DLinkedList     = require('koru/dlinked-list');

  const models$ = Symbol();

  class Match {
    constructor() {
      this[models$] = Object.create(null);
    }

    has(doc, reason) {
      const mm = this[models$][doc.constructor.modelName];
      if (mm === undefined) return false;
      for (const comparator of mm) if (comparator(doc, reason)) return true;
      return false;
    }

    register(modelName, comparator) {
      modelName = typeof modelName === 'string' ? modelName : modelName.modelName;

      const models = this[models$];
      const matchFuncs = models[modelName] || (models[modelName] = new DLinkedList());
      const handle = matchFuncs.add(comparator);
      handle.modelName = modelName;
      return handle;
    }

    _clear() {
      const models = this[models$];
      for (const modelName in models) {
        const matchFuncs = models[modelName];
        if (matchFuncs !== void 0)
          matchFuncs.clear();
      }
    }
  }

  return Match;
});

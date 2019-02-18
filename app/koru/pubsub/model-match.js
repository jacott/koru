define((require)=>{
  const DLinkedList     = require('koru/dlinked-list');

  const models$ = Symbol();

  class ModelMatch {
    constructor() {
      this[models$] = Object.create(null);
    }

    has(doc) {
      const mm = this[models$][doc.constructor.modelName];
      if (mm === void 0) return void 0;
      let result = void 0;
      for (const comparator of mm) {
        const ans = comparator(doc);
        if (ans === true) return true;
        if (ans === false) result = false;
      }

      return result;
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

  return ModelMatch;
});

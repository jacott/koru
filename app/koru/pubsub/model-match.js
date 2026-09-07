define((require) => {
  'use strict';
  const DLinkedList     = require('koru/dlinked-list');

  const models$ = Symbol();

  class ModelMatch {
    constructor() {
      this[models$] = Object.create(null);
    }

    has(doc) {
      const mm = this[models$][doc.constructor.modelName];
      if (mm === undefined) return;
      let result = undefined;
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
      const matchFuncs = models[modelName] ??= new DLinkedList();
      const handle = matchFuncs.add(comparator);
      handle.modelName = modelName;
      return handle;
    }

    _clear() {
      const models = this[models$];
      for (const modelName in models) {
        models[modelName]?.clear();
      }
    }
  }

  return ModelMatch;
});

define((require, exports, module)=>{
  const ModelMap        = require('koru/model/map');
  const util            = require('koru/util');

  const excludeModels$ = Symbol(), includeModels$ = Symbol();

  return Base => class extends Base {
    static resetModelList() {
      this[excludeModels$] = {UserLogin: true},
      this[includeModels$] = {};
    }

    static *includedModels() {
      const excludeModels = this[excludeModels$];
      const includeModels = this[includeModels$];

      for (const name in util.isObjEmpty(includeModels) ? ModelMap : includeModels) {
        if (excludeModels[name] === void 0) {
          const model = ModelMap[name];
          if (model !== void 0 && ('query' in model)) yield model;
        }
      }
    }

    static excludeModel(...names) {
      if (! util.isObjEmpty(this[includeModels$]))
        this[includeModels$] = {};
      for (const name of names) this[excludeModels$][name] = true;
    }

    static includeModel(...names) {
      if (! util.isObjEmpty(this[excludeModels$]))
        this[excludeModels$] = {};
      for (const name of names) this[includeModels$][name] = true;
    }
  };
});

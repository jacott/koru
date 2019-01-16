define((require, exports, module)=>{
  const ModelMap        = require('koru/model/map');
  const Subscription    = require('koru/pubsub/subscription');
  const util            = require('koru/util');

  const config$ = Symbol();

  const truth = ()=> true;

  const {hasOwn} = util;

  const config = (obj)=> hasOwn(obj, config$) ?
      obj[config$]
        : (obj[config$] === void 0 ?
           obj.resetConfig() :
           obj[config$] = Object.assign({}, obj[config$]));

  class AllSub extends Subscription {
    connect() {
      const {excludeModels, includeModels} = config(this.constructor);

      for (const name in util.isObjEmpty(includeModels) ? ModelMap : includeModels) {
        if (excludeModels[name] !== void 0) continue;
        const model = ModelMap[name];
        if (model !== void 0 && ('query' in model))
          this.match(name, truth);
      }
      super.connect();
    }

    reconnecting() {
      const {excludeModels, includeModels} = config(this.constructor);

      for (const name in util.isObjEmpty(includeModels) ? ModelMap : includeModels) {
        if (excludeModels[name] !== void 0) continue;
        const model = ModelMap[name];
        if (model !== void 0) {
          const {query} = model;
          query !== void 0 && query.forEach(Subscription.markForRemove);
        }
      }
    }

    static resetConfig() {
      return this[config$] = {
        excludeModels: {UserLogin: true},
        includeModels: {},
      };
    }
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

  }
  AllSub.module = module;

  return AllSub;
});

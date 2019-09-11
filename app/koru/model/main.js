define((require, exports, module)=>{
  'use strict';
  const ModelEnv        = require('koru/env!./main');
  const BaseModel       = require('koru/model/base-model');
  const koru            = require('../main');
  const util            = require('../util');
  const ModelMap        = require('./map');

  const {private$} = require('koru/symbols');

  koru.onunload(module, () => {koru.unload(koru.absId(require, './map'))});

  const {_support} = BaseModel[private$];

  ModelEnv.init(BaseModel, _support);

  util.mergeNoEnum(ModelMap, {
    BaseModel,

    define(module, name, proto) {
      let model, fields;
      if (typeof module === 'object' && ! module.id) {
        name = module.name;
        proto = module.proto;
        fields = module.fields;
        module = module.module;
      } else {
        if (typeof module === 'string' || module.create) {
          proto = name;
          name = module;
          module = void 0;
        }
        switch(typeof name) {
        case 'string':
          break;
        case 'function':
          model = name;
          name = model.name;
          break;
        default:
          proto = name;
          name = null;
          break;
        }
      }

      module && koru.onunload(module, () => ModelMap._destroyModel(name));

      if (! name)
        name =  moduleName(module);

      if (! model) {
        model = {[name]: class extends BaseModel {}}[name];
      }

      proto === undefined || util.merge(model.prototype, proto);

      return model.define({module, name, fields});
    },

    _support,

    _destroyModel(name, drop) {
      const model = ModelMap[name];
      if (! model) return;

      ModelEnv.destroyModel(model, drop);

      delete ModelMap[name];
    },
  });

  const moduleName = module => module && util.capitalize(util.camelize(
    module.id.replace(/^.*\//, '').replace(/-(?:server|client)$/, '')
  ));

  return ModelMap;
});

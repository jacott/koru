define(function(require, exports, module) {
  const ModelEnv  = require('koru/env!./main');
  const BaseModel = require('koru/model/base-model');
  const koru      = require('../main');
  const util      = require('../util');
  const ModelMap  = require('./map');

  const {private$} = require('koru/symbols');

  koru.onunload(module, () => {koru.unload(koru.absId(require, './map'))});

  const {allObserverHandles$, _support} = BaseModel[private$];

  ModelEnv.init(BaseModel, _support);

  util.mergeNoEnum(ModelMap, {
    BaseModel,

    /**
     * Define a new model.
     * define(options) or
     * define(module, [name, [proto]])
     * @see BaseModel.define
     */
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
          module = null;
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

      let oh = model[allObserverHandles$];
      if (oh) for (const modelObservers of oh) {
        for (const name in modelObservers) {
          modelObservers[name] = modelObservers[name].filter(entry => {
            return entry[1] !== model;
          });
        }
      }
    },
  });

  const moduleName = module => module && util.capitalize(util.camelize(
    module.id.replace(/^.*\//, '').replace(/-(?:server|client)$/, '')
  ));

  return ModelMap;
});

define(function(require, exports, module) {
  const ModelEnv             = require('koru/env!./main');
  const Query                = require('koru/model/query');
  const koru                 = require('../main');
  const Random               = require('../random');
  const session              = require('../session/base');
  const util                 = require('../util');
  const ModelMap             = require('./map');
  const registerObserveField = require('./register-observe-field');
  const registerObserveId    = require('./register-observe-id');
  const Val                  = require('./validation');

  module.exports = ModelMap;

  /**
   * Track before/after/finally observers observing a model.
   **/
  const allObservers = new WeakMap;

  /**
   * Track before/after/finally observers registered to a model. This
   * allows a observer to be deallocated when a model is destroyed.
   **/
  const allObserverHandles = new WeakMap;

  koru.onunload(module, function () {
    koru.unload(koru.absId(require, './map'));
  });

  class BaseModel {
    constructor(attributes, changes) {
      if(attributes && attributes.hasOwnProperty('_id')) {
        // existing record
        this.attributes = attributes;
        this.changes = changes || {};
      } else {
        // new record
        this.attributes = {};
        this.changes = attributes || {};
        util.extend(this.changes, this.constructor._defaults);
      }
    }

    static create(attributes) {
      const doc = new this({});
      attributes && util.extend(doc.changes, util.deepCopy(attributes));
      doc.$save();
      return isServer ? doc : (doc.constructor.findById(doc._id) || doc);
    }

    static _insertAttrs(attrs) {
      ModelEnv._insertAttrs(this, attrs);
      return attrs._id;
    }

    /**
     * Build a new model. Does not copy _id from attributes.
     */
    static build(attributes, allow_id) {
      const doc = new this({});
      attributes = attributes ? util.deepCopy(attributes) : {};

      if (attributes._id && ! allow_id)
        attributes._id = null;
      attributes && util.extend(doc.changes, util.deepCopy(attributes));
      return doc;
    }

    static transaction(func) {
      return _support.transaction(this, func);
    }

    static toId(docOrId) {
      if (! docOrId || typeof docOrId === 'string') return docOrId;
      return docOrId._id;
    }

    static toDoc(docOrId) {
      if (! docOrId || typeof docOrId === 'string') return this.findById(docOrId);
      return docOrId;
    }

    static get query() {
      return new Query(this);
    }

    static where() {
      const query = this.query;
      return query.where.apply(query, arguments);
    }

    static onId(id) {
      return this.query.onId(id);
    }

    static exists(condition) {
      const query = new Query(this);
      if (typeof condition === 'string')
        query.onId(condition);
      else
        query.where(condition);

      return query.exists();
    }

    static findBy(field, value) {
      return this.query.where(field, value).fetchOne();
    }

    static isLocked(id) {
      return (this._locks || (this._locks = Object.create(null)))[id] || false;
    }

    static lock(id, func) {
      if (this.isLocked(id))
        func.call(this, id);
      else {
        this._locks[id] = true;
        try {
          func.call(this, id);
        } finally {
          delete this._locks[id];
        }
      }
    }


    /**
     * Model extension methods
     */

    static define({module, name, fields}) {
      if (! name)
        name = moduleName(module);
      if (! name)
        throw new Error("Model requires a name");
      if (ModelMap[name])
        throw new Error(`Model '${name}' already defined`);
      if (module) {
        koru.onunload(module, () => ModelMap._destroyModel(name));
      }

      ModelMap[name] = this;

      this.modelName = name;
      this._fieldValidators = {};
      this._defaults = {};
      ModelEnv.setupModel(this);

      this.fieldTypeMap = {};

      registerObserveId(this);
      registerObserveField(this);

      fields && this.defineFields(fields);

      return this;
    }


    static defineFields(fields) {
      const proto = this.prototype;
      let $fields = this.$fields;
      if (! $fields) $fields = this.$fields = {_id: {type: 'id'}};
      for(let field in fields) {
        let options = fields[field];
        if (! options.type) options = {type: options};
        const func = typeMap[options.type];
        func && func(this, field, options);
        setUpValidators(this, field, options);

        if (options['default'] !== undefined) this._defaults[field] = options['default'];
        $fields[field] = options;
        if (options.accessor !== false) defineField(proto,field, options.accessor);
      }
      _support.resetDocs(this);
      return this;
    }

    static hasMany(name, model, finder) {
      Object.defineProperty(this.prototype, name, {
        configurable: true,
        get: function () {
          const query = model.query;
          finder.call(this, query);
          return query;
        }
      });
    }

    static changesTo(field, doc, was) {
      let cache = this._changesToCache;
      if (cache && cache.field === field && cache.doc === doc && cache.was === was)
        return cache.keyMap;

      cache = this._changesToCache = {field: field, doc: doc, was: was};

      if (doc) {

        if (was) {
          if (field in was) {
            cache.keyMap = 'upd';
          } else {
            const regex = new RegExp("^"+field+"\\.([^.]+)");
            let m;
            for (let key in was) {
              if (m = regex.exec(key)) {
                if (! cache.keyMap) {
                  cache.keyMap = {};
                };
                cache.keyMap[m[1]] = key;
              }
            }
          }
        } else if (field in doc.attributes) {
          cache.keyMap = 'add';
        }
      } else if (field in was.attributes) {
        cache.keyMap = 'del';
      }
      return cache.keyMap;
    }

    static addVersioning() {
      const model = this;
      const proto = model.prototype;

      model.hasVersioning = true;
      Object.defineProperty(proto, '_version', versionProperty);

      proto.$bumpVersion = _support.bumpVersion;
      model.$fields._version = {type: 'integer', $system: true};
      _support.resetDocs(model);
      return this;
    }

    static remote(funcs) {
      const prefix = this.modelName + '.';

      for(let key in funcs) {
        session.defineRpc(prefix + key, _support.remote(this, key, funcs[key]));
      }

      return this;
    }




    /**
     * Instance methods
     **/

    get _id() {return this.attributes._id || this.changes._id;}

    get classMethods() {return this.constructor;}

    $inspect() {
      return "{Model: " + this.constructor.modelName + "_" + this._id + "  " + this.name + "}";
    }

    $save(force) {
      var doc = this;
      switch(force) {
      case 'assert': doc.$assertValid(); break;
      case 'force': break;
      default:
        if (! doc.$isValid())
          return false;
      }
      ModelEnv.save(doc);

      return doc;
    }

    $put(updates, value) {
      if (arguments.length === 2) {
        var key = updates;
        updates = {};
        updates[key] = value;
      }

      ModelEnv.put(this, updates);
      return this;
    }

    $$save() {
      return this.$save('assert');
    }

    $isValid() {
      var doc = this,
          model = doc.constructor,
          fVTors = model._fieldValidators;

      doc._errors = null;

      if(fVTors) {
        for(let field in fVTors) {
          let validators = fVTors[field];
          for(let vTor in validators) {
            let args = validators[vTor];
            let options = args[1];

            if (typeof options === 'function')
              options = options.call(doc, field, args[2]);
            args[0](doc,field, options, args[2]);
          }
        }
      }

      doc.validate && doc.validate();

      return ! doc._errors;
    }

    $assertValid() {
      Val.allowIfValid(this.$isValid(), this);
    }

    $equals(other) {
      if (this === other) return true;
      return other && other._id && this._id && this._id === other._id && this.constructor === other.constructor;
    }

    $isNewRecord() {
      return ! this.attributes._id;
    }

    $change(field) {
      if (field in this.changes)
        return this.changes[field];
      return this.changes[field] = util.deepCopy(this[field]);
    }

    $hasChanged(field, changes) {
      changes = changes || this.changes;

      if (field in changes) return true;

      const len = field.length;

      for(let key in changes) {
        if (key.length > len && key[len] === "." && key.slice(0, len)  === field) return true;
      }
      return false;
    }

    /**
     * Return a doc representing this doc with the supplied changes
     * staged against it such that calling doc.$save will apply the changes.
     *
     * If this method is called again with the same changes object
     * then a cached version of the before doc is returned.
     */
    $withChanges(changes) {
      const cache = this.$cache.$withChanges || (this.$cache.$withChanges = []);
      if (changes === cache[0]) return cache[1];

      cache[0] = changes;

      let simple = true;
      for(var attr in changes) {
        if (attr.indexOf(".") !== -1) {
          simple = false;
          break;
        }
      }

      var attrs = this.attributes;

      if (simple)
        return cache[1] = new this.constructor(attrs, changes);

      var cc = {};

      for(var attr in changes) {
        var index = attr.indexOf(".");
        var desc = Object.getOwnPropertyDescriptor(changes, attr);

        if (index === -1) {
          Object.defineProperty(cc, attr, desc);
        } else { // update part of attribute
          var ov, parts = attr.split(".");
          var curr = cc[parts[0]];
          if (! curr)
            curr = cc[parts[0]] = util.deepCopy(attrs[parts[0]]) || {};
          for(var i = 1; i < parts.length - 1; ++i) {
            var part = parts[i];
            curr = curr[part] || (curr[part] = {});
          }
          part = parts[i];
          var m = part.match(/^\$([+\-])(\d+)/);
          if (m) {
            part = +m[2];
            if (m[1] === '-')
              util.removeItem(curr, desc.value);
            else
              util.addItem(curr, desc.value);
          } else
            Object.defineProperty(curr, part,  desc);
        }
      }
      return cache[1] = new this.constructor(attrs, cc);
    }

    /**
     * Use the {beforeChange} keys to extract the new values.
     *
     * @returns new hash of extracted values.
     */
    $asChanges(beforeChange) {
      const attrs = this.attributes;
      const result = {};
      for(let key in beforeChange) {
        const idx = key.lastIndexOf(".");
        if (idx === -1) {
          result[key] = attrs[key];
        } else if (key[idx+1] !== '$') {
          result[key] = util.lookupDottedValue(key, attrs);
        } else {
          result[key.slice(0, idx+2) + (key[idx+2] === '-' ? '+' : '-') + key.slice(idx+3)] = beforeChange[key];
        }

      }
      return result;
    }

    get $onThis() {
      return new Query(this.constructor).onId(this._id);
    }

    $update() {
      var query = this.$onThis;
      return query.update.apply(query, arguments);
    }

    $clearChanges() {
      util.isObjEmpty(this.changes) || (this.changes = {});
    }

    $loadCopy() {
      return new this.constructor(this.attributes);
    }

    $setFields(fields,options) {
      for(var i = 0,field;field = fields[i];++i) {
        if (field[0] !== '_' && options.hasOwnProperty(field)) {
          this[field] = options[field];
        }
      }

      return this;
    }

    get $cache() {return this._cache || (this._cache = {})}

    $clearCache() {
      this._cache = null;
      return this;
    }

    $cacheRef(key) {
      return this.$cache[key] || (this.$cache[key] = {});
    }
  }

  BaseModel.getField = getField;
  BaseModel.setField = setField;

  session.defineRpc("put", function (modelName, id, updates) {
    Val.assertCheck([modelName, id], ['string']);
    const model = ModelMap[modelName];
    Val.allowIfFound(model);
    const  doc = model.findById(id);
    Val.allowIfFound(doc);

    const [changes, pSum] = _support.validatePut(doc, updates);
    try {
      var ex;

      callBeforeObserver('beforeUpdate', doc, pSum);
      callBeforeObserver('beforeSave', doc, pSum);
      const query = doc.$onThis;
      for (let key in pSum) {
        util.extend(changes, pSum[key]);
      }
      doc.changes = {};
      query.update(changes);
    } catch(ex1) {
      ex = ex1;
    } finally {
      callWhenFinally(doc, ex);
    }
    if (ex) throw ex;
  });


  function callBeforeObserver(type, doc, partials) {
    const model = doc.constructor;
    const modelObservers = allObservers.get(model);
    const observers = modelObservers && modelObservers[type];
    if (observers) for (let i = 0; i < observers.length; ++i) {
      observers[i][0].call(model, doc, type, partials);
    }
  }

  function callAfterObserver(doc, was) {
    const model = (doc || was).constructor;
    const modelObservers = allObservers.get(model);
    const observers = modelObservers && modelObservers['afterLocalChange'];
    if (observers) for (let i = 0; i < observers.length; ++i) {
      observers[i][0].call(model, doc, was);
    }
  }

  function callWhenFinally(doc, ex) {
    const model = doc.constructor;
    const modelObservers = allObservers.get(model);
    const observers = modelObservers && modelObservers['whenFinally'];
    if (observers) for (let i = 0; i < observers.length; ++i) {
      try {
        observers[i][0].call(model, doc, ex);
      } catch(ex1) {
        ex = ex || ex1;
      }
    }
  }

  (() => {
    for (let type of ['beforeCreate','beforeUpdate','beforeSave','beforeRemove',
                    'afterLocalChange','whenFinally'])
      registerType(type);

    function registerType(type) {
      BaseModel[type] = function (subject, callback) {
        registerObserver(this, subject, type, callback);
        return this;
      };
    }
  })();

  function registerObserver(model, subject, name, callback) {
    let modelObservers = allObservers.get(subject);
    if (! modelObservers)
      allObservers.set(subject, modelObservers = Object.create(null));
    (modelObservers[name] || (modelObservers[name] = [])).push([callback, model]);
    let oh = allObserverHandles.get(model);
    if (! oh)
      allObserverHandles.set(model, oh = new Set);
    oh.add(modelObservers);
  }

  const versionProperty = {
    configurable: true,
    get: function () {
      return this.attributes._version;
    },

    set: function (value) {
      this.attributes._version = value;
    }
  };

  const _support = {
    setupExtras: [],

    validatePut(doc, updates) {
      var userId = koru.userId();
      Val.allowAccessIf(userId && doc.authorizePut);
      var changes = {};
      var partials = {};
      ModelMap.splitUpdateKeys(changes, partials, updates);
      doc.changes = changes;
      if (typeof doc.authorizePut === 'function')
        doc.authorizePut(userId, partials);
      else {
        doc.authorize && doc.authorize(userId, {put: partials});
        for (var key in partials) {
          var validator = doc.authorizePut[key];
          Val.allowAccessIf(validator, 'no validator for ' + key);
          validator(doc, partials[key], key);
        }

      }
      doc.$assertValid();

      return [changes, partials];
    },

    performBumpVersion(model, _id, _version) {
      new Query(model).onId(_id).where({_version: _version}).inc("_version", 1).update();
    },

    performInsert(doc) {
      const model = doc.constructor;

      doc.changes = doc.attributes;
      const attrs = doc.attributes = {};

      try {
        var ex;
        callBeforeObserver('beforeCreate', doc);
        callBeforeObserver('beforeSave', doc);


        doc.attributes = doc.changes;
        doc.changes = attrs;
        model.hasVersioning && (doc.attributes._version = 1);

        ModelEnv.insert(doc);
      } catch(ex1) {
        ex = ex1;
      } finally {
        callWhenFinally(doc, ex);
      }
      if (ex) throw ex;
    },

    performUpdate(doc, changes) {
      const model = doc.constructor;

      doc.changes = changes;

      try {
        var ex;
        callBeforeObserver('beforeUpdate', doc);
        callBeforeObserver('beforeSave', doc);
        const st = new Query(model).onId(doc._id);

        model.hasVersioning && st.inc("_version", 1);

        doc.changes = {};
        st.update(changes);
      } catch(ex1) {
        ex = ex1;
      } finally {
        callWhenFinally(doc, ex);
      }
      if (ex) throw ex;
    },

    _updateTimestamps(changes, timestamps, now) {
      if (timestamps) {
        for(let key in timestamps)  {
          changes[key] = changes[key] || now;
        }
      }
    },

    _addUserIds(changes, userIds, user_id) {
      if (userIds) {
        for(let key in userIds)  {
          changes[key] = changes[key] || user_id;
        }
      }
    },

    callBeforeObserver,
    callAfterObserver,
  };

  ModelEnv.init(ModelMap, BaseModel, _support);

  util.mergeNoEnum(ModelMap, {
    BaseModel,

    /**
     * Define a new model.
     * define(options) or
     * define(module, [name, [proto]])
     * @see BaseModel.define
     */
    define(module, name, proto) {
      let model;
      if (typeof module === 'object' && ! module.id) {
        name = module.name;
        proto = module.proto;
        var fields = module.fields;
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

      proto && util.extend(model.prototype, proto);

      return model.define({module, name, fields});
    },

    _support,

    _destroyModel(name, drop) {
      const model = ModelMap[name];
      if (! model) return;

      ModelEnv.destroyModel(model, drop);

      delete ModelMap[name];

      let oh = allObserverHandles.get(model);
      if (oh) for (let modelObservers of oh) {
        for (let name in modelObservers) {
          modelObservers[name] = modelObservers[name].filter(entry => {
            return entry[1] !== model;
          });
        }
      }
    },

    splitUpdateKeys(changes, partials, updates) {
      for (let key in updates) {
        const pos = key.indexOf(".");
        if (pos === -1)
          changes[key] = updates[key];
        else {
          let mainKey = key.slice(0, pos);
          let section = partials[mainKey] || (partials[mainKey] = {});
          section[key] = updates[key];
        }
      }
    },
  });

  const typeMap = {
    belongs_to(model, field, options) {
      if (! options.accessor) {
        const setv = setValue(field);
        options.accessor = {
          get: getValue(field),
          set: function (value) {
            return setv.call(this, value || undefined);
          },
        };
      }
      const name = field.replace(/_id/,'');
      let bt = options.model;
      if (! bt) {
        var btName = options.modelName || util.capitalize(name);
        bt = ModelMap[btName];
      }
      mapFieldType(model, field, bt, btName);
      Object.defineProperty(model.prototype, name, {
        configurable: true,
        get: belongsTo(bt, name, field),
      });
    },

    user_id_on_create(model, field, options) {
      typeMap.belongs_to.call(this, model, field, options);
      model.userIds = model.userIds || {};
      model.userIds[field] = 'create';
    },

    has_many(model, field, options) {
      let bt = options.model;
      if (! bt) {
        var name = options.modelName ||
              (options.associated &&
               (typeof options.associated === 'string' ?
                options.associated : options.associated.modelName)) ||
              util.capitalize(util.sansId(field));

        bt = ModelMap[name];
      }
      mapFieldType(model, field, bt, name);
    },

    auto_timestamp(model, field) {
      if (/create/i.test(field)) {
        model.createTimestamps = model.createTimestamps || {};
        model.createTimestamps[field] = true;
      } else {
        model.updateTimestamps = model.updateTimestamps || {};
        model.updateTimestamps[field] = true;
      }
    },
  };

  function mapFieldType(model, field, bt, name) {
    if (! bt) throw Error(name + ' is not defined for field: ' + field);
    model.fieldTypeMap[field] = bt;
  }



  function defineField(proto, field, accessor) {
    Object.defineProperty(proto, field, {
      configurable: true,
      get: (accessor && accessor.get) || getValue(field),

      set: (accessor && accessor.set) || setValue(field),
    });
  }

  function belongsTo(model, name, field) {
    return function () {
      const value = this[field];
      return value && this.$cacheRef(name)[value] || (this.$cacheRef(name)[value] = model.findById(value));
    };
  }

  function getField(doc, field) {
    return doc.changes.hasOwnProperty(field) ? doc.changes[field] : doc.attributes[field];
  }

  function setField(doc, field, value) {
    if (value === doc.attributes[field]) {
      if (doc.changes.hasOwnProperty(field)) {
        if (value === undefined && doc.constructor._defaults[field] !== undefined)
          doc.changes[field] = util.deepCopy(doc.constructor._defaults[field]);
        else
          delete doc.changes[field];

        doc._setChanges && doc._setChanges(field, value);
      }
    } else {
      doc.changes[field] = value;
      doc._setChanges && doc._setChanges(field, value);
    }
    return value;
  }

  function getValue(field) {
    return function () {return getField(this, field)};
  }

  function setValue(field) {
    return function (value) {return setField(this, field, value)};
  }

  function setUpValidators(model, field, options) {
    const validators = getValidators(model, field);
    let valFunc;

    if (typeof options === 'object') {

      for(let validator in options) {

        if(valFunc = Val.validators(validator)) {
          validators[validator]=[valFunc, options[validator], options];
        }
      }
    }
  }

  function getValidators(model, field) {
    return model._fieldValidators[field] || (model._fieldValidators[field] = {});
  }

  function moduleName(module) {
    return module && util.capitalize(util.camelize(module.id.replace(/^.*\//, '')));
  }

});

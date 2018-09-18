define((require, exports, module)=>{
  const Changes         = require('koru/changes');
  const ModelEnv        = require('koru/env!./main');
  const dbBroker        = require('koru/model/db-broker');
  const ModelMap        = require('koru/model/map');
  const Query           = require('koru/model/query');
  const Val             = require('koru/model/validation');
  const Observable      = require('koru/observable');
  const session         = require('koru/session');
  const util            = require('koru/util');
  const registerObserveField = require('./register-observe-field');
  const registerObserveId = require('./register-observe-id');

  const {hasOwn, deepCopy} = util;
  const {private$, inspect$, error$} = require('koru/symbols');

  const cache$ = Symbol(), observers$ = Symbol(), changes$ = Symbol();

  function Lock() {
    this.temp = '';
    delete this.temp;
  }

  const savePartial = (doc, args, force)=>{
    const $partial = {};
    for(let i = 0; i < args.length; i+=2) {
      $partial[args[i]] = args[i+1];
    }

    doc.changes = {$partial};
    return doc.$save(force);
  };

  const versionProperty = {
    configurable: true,
    get() {return this.attributes._version},
    set(value) {this.attributes._version = value}
  };

  const registerObserver = (model, name, callback)=>{
    const subj = model[observers$][name] || (model[observers$][name] = new Observable);
    return subj.onChange(callback).stop;
  };

  const callBeforeQueryUpdate = (doc, changes)=>{
    const subj = doc.constructor[observers$].beforeQueryUpdate;
    subj === undefined || subj.notify(doc, changes);
  };

  const callBeforeObserver = (type, doc) => {
    const subj = doc.constructor[observers$][type];
    subj === undefined || subj.notify(doc, type);
  };

  const callAfterLocalChange = (doc, undo) => {
    const subj = (doc || undo).constructor[observers$].afterLocalChange;
    subj === undefined || subj.notify(doc, undo);
  };

  const callWhenFinally = (doc, ex) => {
    const subj = doc.constructor[observers$].whenFinally;
    if (subj !== undefined) for (const {callback} of subj) {
      try {
        callback(doc, ex);
      } catch(ex1) {
        if (ex === undefined) ex = ex1;
      }
    }
  };

  const moduleName = module => module && util.capitalize(util.camelize(
    module.id.replace(/^.*\//, '').replace(/-(?:server|client)$/, '')
  ));


  class BaseModel {
    constructor(attributes, changes={}) {
      const dbIdField = this.constructor.$dbIdField;
      if (dbIdField !== undefined) {
        this[dbIdField] = dbBroker.dbId;
      }
      if(attributes != null && attributes._id !== undefined) {
        // existing record
        this.attributes = attributes;
        this.changes = changes;
      } else {
        // new record
        this.attributes = {};
        this.changes = Object.assign({}, this.constructor._defaults);
        if (attributes != null)
          Object.assign(this.changes, attributes);
        Object.assign(this.changes, changes);
      }
    }

    static create(attributes) {
      const doc = new this({});
      attributes != null && Object.assign(doc.changes, deepCopy(attributes));
      doc.$save();
      return doc;
    }

    static _insertAttrs(attrs) {
      Query._insertAttrs(this, attrs);
      return attrs._id;
    }

    /**
     * Build a new model. Does not copy _id from attributes.
     */
    static build(attributes, allow_id) {
      const doc = new this({});
      attributes = attributes == null ? {} : deepCopy(attributes);

      if (attributes._id && ! allow_id)
        attributes._id = null;
      attributes == null || Object.assign(doc.changes, deepCopy(attributes));
      return doc;
    }

    static transaction(func) {
      return _support.transaction(this, func);
    }

    static toId(docOrId) {
      return typeof docOrId === 'string' ? docOrId :
        docOrId == null ? null : docOrId._id;
    }

    static toDoc(docOrId) {
      return typeof docOrId === 'string' ? this.findById(docOrId)
        : docOrId == null ? null : docOrId;
    }

    static get query() {
      return new Query(this);
    }

    static where(...args) {
      return this.query.where(...args);
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
      return (this._locks || (this._locks = new Lock))[id] || false;
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

    static define({module, name=moduleName(module), fields}) {
      if (! name)
        throw new Error("Model requires a name");
      if (ModelMap[name])
        throw new Error(`Model '${name}' already defined`);
      if (module) {
        this._module = module;
        module.onUnload(()=> ModelMap._destroyModel(name));
      }

      ModelMap[name] = this;

      this.modelName = name;
      this._fieldValidators = {};
      this._defaults = {};
      this[observers$] = {};
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
      for(const field in fields) {
        let options = fields[field];
        if (! options.type) options = {type: options};
        const func = typeMap[options.type];
        func && func(this, field, options);
        setUpValidators(this, field, options);

        if (options['default'] !== undefined) this._defaults[field] = options['default'];
        if (! options.not_a_real_field) {
          $fields[field] = options;
          if (options.accessor !== false) defineField(proto,field, options.accessor);
        }
      }
      _support.resetDocs(this);
      return this;
    }

    static hasMany(name, model, finder) {
      Object.defineProperty(this.prototype, name, {
        configurable: true,
        get() {
          const query = model.query;
          finder.call(this, query);
          return query;
        }
      });
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

      for(const key in funcs) {
        session.defineRpc(prefix + key, _support.remote(this, key, funcs[key]));
      }

      return this;
    }

    static remoteGet(funcs) {
      const prefix = this.modelName + '.';

      for(const key in funcs) {
        session.defineRpcGet(prefix + key, _support.remote(this, key, funcs[key]));
      }

      return this;
    }




    /**
     * Instance methods
     **/

    get _id() {return this.attributes._id || this.changes._id}

    get classMethods() {return this.constructor}

    get _errors() {return this[error$]}

    [inspect$]() {
      return `{Model: ${this.constructor.modelName}_${this._id} ${this.name||''}}`;
    }

    $save(force) {
      const callback = force && force.callback;

      switch(force) {
      case 'assert': this.$assertValid(); break;
      case 'force': this.$isValid(); break;
      default:
        if (! this.$isValid())
          return false;
      }
      ModelEnv.save(this, callback);

      return this;
    }

    $$save() {
      return this.$save('assert');
    }

    $savePartial(...args) {
      return savePartial(this, args);
    }

    $$savePartial(...args) {
      return savePartial(this, args, 'assert');
    }

    $isValid() {
      const model = this.constructor,
            fVTors = model._fieldValidators;

      if (this[error$] !== undefined) this[error$] = undefined;

      const origChanges = this.changes;
      const topLevel = origChanges.$partial &&
              Changes.topLevelChanges(this.attributes, origChanges);
      if (topLevel) {
        this.changes = deepCopy(topLevel);
        Changes.setOriginal(this.changes, origChanges);
      }

      if(fVTors !== undefined) {
        for(const field in fVTors) {
          const validators = fVTors[field];
          for(const vTor in validators) {
            const args = validators[vTor];
            const options = args[1];
            args[0](
              this, field,
              typeof options === 'function' ? options.call(this, field, args[2]) : options,
              args[2]);
          }
        }
      }

      this.validate && this.validate();

      const isOkay = this[error$] === undefined;
      if (topLevel !== undefined) {
        if (isOkay) {
          Changes.updateCommands(origChanges, this.changes, topLevel);
        }
        this.changes = origChanges;
      }

      return isOkay;
    }

    $assertValid() {
      Val.allowIfValid(this.$isValid(), this);
    }

    $equals(other) {
      if (this === other) return true;
      return other && other._id && this._id && this._id === other._id &&
        this.constructor === other.constructor;
    }

    $isNewRecord() {
      return ! this.attributes._id;
    }

    $change(field) {
      if (field in this.changes)
        return this.changes[field];
      return this.changes[field] = deepCopy(this[field]);
    }

    $hasChanged(field, changes=this.changes) {return Changes.has(changes, field)}

    $fieldDiffs(field) {
      return Changes.has(this.changes, field)
        ? Changes.fieldDiff(field, this.attributes, this.changes)
        : undefined;
    }

    $fieldDiffsFrom(field, undo) {
      return Changes.fieldDiff(field, undo, this.attributes);
    }

    $withChanges(changes) {
      if (changes == null) return null;
      const cached = changes[changes$];
      if (cached !== undefined) return cached;

      return changes[changes$] = new this.constructor(
        this.attributes, Changes.topLevelChanges(this.attributes, changes));
    }

    $asChanges(beforeChange) {
      return Changes.extractChangeKeys(this.attributes, beforeChange);
    }

    get $onThis() {
      return new Query(this.constructor).onId(this._id);
    }

    $update(...args) {
      return this.$onThis.update(...args);
    }

    $updatePartial(...args) {
      return this.$onThis.updatePartial(...args);
    }

    $clearChanges() {
      util.isObjEmpty(this.changes) || (this.changes = {});
    }

    $loadCopy() {
      return new this.constructor(this.attributes);
    }

    $setFields(fields,options) {
      for(let i = 0,field;field = fields[i];++i) {
        if (field[0] !== '_' && options[field] !== undefined) {
          this[field] = options[field];
        }
      }

      return this;
    }

    get $cache() {return this[cache$] || (this[cache$] = {})}

    $clearCache() {
      if (this[cache$] !== undefined)
      this[cache$] = undefined;
      return this;
    }

    $cacheRef(key) {
      return this.$cache[key] || (this.$cache[key] = {});
    }
  }
  const _support = {
    setupExtras: [],

    performBumpVersion(model, _id, _version) {
      new Query(model).onId(_id).where({_version: _version}).inc("_version", 1).update();
    },

    performInsert(doc) {
      const model = doc.constructor;
      let ex;

      doc.changes = doc.attributes;
      const attrs = doc.attributes = {};

      try {
        callBeforeObserver('beforeCreate', doc);
        callBeforeObserver('beforeSave', doc);


        doc.attributes = doc.changes;
        doc.changes = attrs;
        model.hasVersioning && (doc.attributes._version = 1);

        Query.insert(doc);
      } catch(ex1) {
        ex = ex1;
      } finally {
        callWhenFinally(doc, ex);
      }
      if (ex) throw ex;
    },

    performUpdate(doc, changes) {
      const model = doc.constructor;
      let ex;

      doc.changes = changes;

      try {
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
        for(const key in timestamps)  {
          if (changes[key] === undefined)
            changes[key] = now;
        }
      }
    },

    _addUserIds(changes, userIds, user_id) {
      if (userIds) {
        for(const key in userIds)  {
          changes[key] = changes[key] || user_id;
        }
      }
    },

    callBeforeQueryUpdate,
    callBeforeObserver,
    callAfterLocalChange,
  };

  const getField = (doc, field) =>{
    const val = hasOwn(doc.changes, field) ? doc.changes[field] : doc.attributes[field];
    return val === null ? undefined : val;
  };

  const setField = (doc, field, value) => {
    const {changes} = doc;
    if (value === null) value = undefined;
    if (value === doc.attributes[field]) {
      if (hasOwn(changes, field)) {
        if (value === undefined && doc.constructor._defaults[field] !== undefined)
          changes[field] = deepCopy(doc.constructor._defaults[field]);
        else
          delete doc.changes[field];

        typeof doc._setChanges === 'function' && doc._setChanges(field, value);
      }
    } else {
      changes[field] = value;
      typeof doc._setChanges === 'function' && doc._setChanges(field, value);
    }
    return value;
  };

  BaseModel.getField = getField;
  BaseModel.setField = setField;

  ("beforeCreate beforeUpdate beforeSave beforeRemove beforeQueryUpdate "+
   "afterLocalChange whenFinally ").split(" ").forEach(type => {
     BaseModel[type] = function (callback) {
       return registerObserver(this, type, callback);
     };
   });

  const mapFieldType = (model, field, bt, name)=>{
    if (! bt) throw Error(name + ' is not defined for field: ' + field);
    model.fieldTypeMap[field] = bt;
  };

  const defineField = (proto, field, accessor)=>{
    Object.defineProperty(proto, field, {
      configurable: true,
      get: (accessor && accessor.get) || getValue(field),

      set: (accessor && accessor.set) || setValue(field),
    });
  };

  const belongsTo = (model, name, field) => function () {
    const value = this[field];
    return value && this.$cacheRef(name)[value] ||
      (this.$cacheRef(name)[value] = model.findById(value));
  };

  const getValue = field => function () {return getField(this, field)};
  const setValue = field => function (value) {return setField(this, field, value)};

  const setUpValidators = (model, field, options)=>{
    const validators = getValidators(model, field);

    if (typeof options === 'object') {

      for(const validator in options) {
        const valFunc = Val.validators(validator);
        if (valFunc !== undefined) {
          validators[validator]=[valFunc, options[validator], options];
        }
      }
    }
  };

  const getValidators =
        (model, field)=> model._fieldValidators[field] || (model._fieldValidators[field] = {});

  const typeMap = {
    belongs_to_dbId(model, field, options) {
      options.not_a_real_field = true;
      if (model.$dbIdField)
        throw new Error("belongs_to_dbId already defined!");
      model.$dbIdField = field;
      options.accessor = {set() {}};
      typeMap.belongs_to.call(this, model, field, options);}
    ,
    belongs_to(model, field, options) {
      if (options.accessor === undefined) {
        const setv = setValue(field);
        options.accessor = {
          get: getValue(field),
          set(value) {
            return setv.call(this, value || undefined);
          },
        };
      }
      const name = field.replace(/_id/,'');
      let bt = options.model, btName;
      if (! bt) {
        btName = options.modelName || util.capitalize(name);
        bt = ModelMap[btName];
        options.model = bt;
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
      let bt = options.model, name;
      if (! bt) {
        name = options.modelName ||
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

  BaseModel[private$] = {
    _support,
  };

  return BaseModel;
});

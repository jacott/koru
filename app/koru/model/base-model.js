//;no-client-async
define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const Changes         = require('koru/changes');
  const ModelEnv        = require('koru/env!./main');
  const Id              = require('koru/id');
  const dbBroker        = require('koru/model/db-broker');
  const ModelMap        = require('koru/model/map');
  const Query           = require('koru/model/query');
  const TransQueue      = require('koru/model/trans-queue');
  const Val             = require('koru/model/validation');
  const Mutex           = require('koru/mutex');
  const Observable      = require('koru/observable');
  const session         = require('koru/session');
  const util            = require('koru/util');
  const registerObserveField = require('./register-observe-field');
  const registerObserveId = require('./register-observe-id');

  const {hasOwn, deepCopy, createDictionary, moduleName} = util;
  const {private$, inspect$, error$, original$} = require('koru/symbols');

  const cache$ = Symbol(),
    uuid$ = Symbol(),
    idLock$ = Symbol(),
    inspectField$ = Symbol(),
    observers$ = Symbol(),
    changes$ = Symbol();

  const savePartial = (doc, args, force) => {
    const $partial = {};
    for (let i = 0; i < args.length; i += 2) {
      $partial[args[i]] = args[i + 1];
    }

    doc.changes = {$partial};
    return doc.$save(force);
  };

  const versionProperty = {
    configurable: true,
    get() {
      return this.attributes._version;
    },
    set(value) {
      this.attributes._version = value;
    },
  };

  const registerObserver = (model, name, callback) => {
    const subj = model[observers$][name] ??= new Observable();
    return subj.onChange(callback).stop;
  };

  const callBeforeObserver = (type, doc) => doc.constructor[observers$][type]?.notify(doc, type);

  const callAfterLocalChange = (docChange) =>
    docChange.model[observers$].afterLocalChange?.notify(docChange);

  const checkIsOkay = (self, topLevel, origChanges) => {
    const isOkay = self[error$] === undefined;
    if (topLevel !== null) {
      if (isOkay) {
        Changes.updateCommands(origChanges, self.changes, topLevel);
      }
      self.changes = origChanges;
    }

    return isOkay;
  };

  class BaseModel {
    constructor(attributes, changes = {}) {
      const dbIdField = this.constructor.$dbIdField;
      if (dbIdField !== undefined) {
        this[dbIdField] = dbBroker.dbId;
      }
      if (attributes?._id != null) {
        // existing record
        this.attributes = attributes;
        this.changes = changes;
      } else {
        // new record
        this.attributes = {};
        this.changes = {...this.constructor._defaults, ...attributes, ...changes};
      }
    }

    static async _saveDoc(doc, mode, saveFunc = ModelEnv.save) {
      const callback = mode?.callback;

      switch (mode) {
        case 'assert':
          await doc.$assertValid();
          break;
        case 'force':
          await doc.$isValid();
          break;
        case 'novalidate':
          break;
        default:
          if (!await doc.$isValid()) {
            return false;
          }
      }

      await saveFunc(doc, callback);
      return true;
    }

    static async create(attributes = {}) {
      const doc = new this(null, deepCopy(attributes));
      await doc.$save();
      return doc;
    }

    static async _insertAttrs(attrs) {
      await Query._insertAttrs(this, attrs);
      return attrs._id;
    }

    static build(changes = {}, allow_id = false) {
      changes = deepCopy(changes);
      if (!allow_id && changes._id != null) {
        changes._id = null;
      }

      return new this(null, changes);
    }

    static transaction(func) {
      return _support.transaction(this, func);
    }

    static toId(docOrId) {
      return typeof docOrId === 'string' ? docOrId : docOrId == null ? null : docOrId._id;
    }

    static toDoc(docOrId) {
      return typeof docOrId === 'string'
        ? this.findById(docOrId)
        : docOrId == null
        ? null
        : docOrId;
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
      if (typeof condition === 'string') {
        query.onId(condition);
      } else {
        query.where(condition);
      }

      return query.exists();
    }

    static findBy(field, value) {
      return this.query.where(field, value).fetchOne();
    }

    static assertFound(doc) {
      if (doc == null) throw new koru.Error(404, this.name + ' Not found');
    }

    static async lockId(id) {
      if (!TransQueue.isInTransaction()) {
        throw new Error('Attempt to lock while not in a transaction');
      }
      const {docs} = this;
      const locks = docs[idLock$] ??= util.createDictionary();
      const mutex = locks[id] ??= new Mutex();
      if (mutex.isLockedByMe) return;
      TransQueue.finally(() => {
        mutex.unlock();
        if (!mutex.isLocked) {
          delete locks[id];
        }
      });
      await mutex.lock();
    }

    static isIdLocked(id) {
      return this.docs[idLock$]?.[id]?.isLocked ?? false;
    }

    /**
     * Model extension methods
     */

    static define({module, inspectField = 'name', name = moduleName(module), fields}) {
      if (!name) {
        throw new Error('Model requires a name');
      }
      if (ModelMap[name] !== undefined) {
        throw new Error(`Model '${name}' already defined`);
      }
      if (module !== undefined) {
        this._module = module;
        module.onUnload(() => ModelMap._destroyModel(name));
      }

      this[inspectField$] = inspectField;

      ModelMap[name] = this;

      this.modelName = name;
      this._fieldValidators = {};
      this._defaults = {};
      this[observers$] = {};
      ModelEnv.setupModel(this);

      this.fieldTypeMap = {};

      registerObserveId(this);
      registerObserveField(this);

      fields != null && this.defineFields(fields);

      return this;
    }

    static defineFields(fields) {
      const proto = this.prototype;
      let $fields = this.$fields;
      if (!$fields) $fields = this.$fields = {_id: {type: 'id'}};
      for (const field in fields) {
        const _options = fields[field];
        const options = (typeof _options === 'string') ? {type: _options} : _options;
        const func = TYPE_MAP[options.type];
        func?.(this, field, options);
        setUpValidators(this, field, options);

        if (options.default !== undefined) this._defaults[field] = options.default;
        if (!options.pseudo_field) {
          $fields[field] = options;
          if (options.accessor !== false) defineField(proto, field, options.accessor);
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
        },
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

      for (const key in funcs) {
        session.defineRpc(prefix + key, _support.remote(this, key, funcs[key]));
      }

      return this;
    }

    static remoteGet(funcs) {
      const prefix = this.modelName + '.';

      for (const key in funcs) {
        session.defineRpcGet(prefix + key, _support.remote(this, key, funcs[key]));
      }

      return this;
    }

    /**
     * Instance methods
     */

    get _id() {
      return this.attributes._id ?? this.changes._id;
    }

    get $uuid() {
      return this[uuid$] ??= Id.fromV1(this._id);
    }

    get classMethods() {
      return this.constructor;
    }

    get _errors() {
      return this[error$];
    }

    [inspect$]() {
      const type = this.constructor;
      const name = this[type[inspectField$]];
      const arg2 = name === undefined ? '' : `, "${name}"`;
      return `Model.${type.modelName}("${this._id}"${arg2})`;
    }

    async $save(mode) {
      return await BaseModel._saveDoc(this, mode);
    }

    async $$save() {
      await this.$save('assert');
      return this;
    }

    $savePartial(...args) {
      return savePartial(this, args);
    }

    $$savePartial(...args) {
      return savePartial(this, args, 'assert');
    }

    async $isValid() {
      const model = this.constructor, fVTors = model._fieldValidators;

      if (this[error$] !== undefined) this[error$] = undefined;

      const origChanges = this.changes;
      const topLevel = ('$partial' in origChanges)
        ? Changes.topLevelChanges(this.attributes, origChanges)
        : null;
      if (topLevel !== null) {
        this.changes = deepCopy(topLevel);
        Changes.setOriginal(this.changes, origChanges);
      }

      if (fVTors !== undefined) {
        for (const field in fVTors) {
          const validators = fVTors[field];
          if (validators !== undefined) {
            const value = this[field];
            for (const vTor in validators) {
              const args = validators[vTor];
              if (
                !args[2].changesOnly || ((original$ in this)
                  ? this[original$] === undefined || this[original$][field] !== value
                  : this.$hasChanged(field))
              ) {
                await args[0].call(Val, this, field, args[1], args[2]);
              }
            }
          }
        }
      }

      if (this.validate !== undefined) {
        await this.validate();
      }

      return checkIsOkay(this, topLevel, origChanges);
    }

    async $assertValid() {
      const ans = await this.$isValid();

      if (!ans && this.attributes._id != null) {
        this.$clearChanges();
      }

      Val.allowIfValid(ans, this);
    }

    $equals(other) {
      if (this === other) return true;
      return other?._id != null && this?._id === other._id &&
        this.constructor === other.constructor;
    }

    $isNewRecord() {
      return !this.attributes._id;
    }

    $change(field) {
      if (field in this.changes) {
        return this.changes[field];
      }
      return this.changes[field] = deepCopy(this[field]);
    }

    $hasChanged(field, changes = this.changes) {
      if (typeof changes === 'string') return hasOwn(this.attributes, field);
      return Changes.has(changes, field);
    }

    $fieldDiff(field) {
      return Changes.has(this.changes, field)
        ? Changes.fieldDiff(field, this.attributes, this.changes)
        : undefined;
    }

    $withChanges(changes = this.changes) {
      if (changes === 'del') return null;
      if (changes === 'add') return this;
      const cached = changes[changes$];
      if (cached !== undefined) return cached;

      return changes[changes$] = new this.constructor(
        this.attributes,
        Changes.topLevelChanges(this.attributes, changes),
      );
    }

    $invertChanges(beforeChange) {
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

    $setFields(fields, options) {
      for (let i = 0, field; field = fields[i]; ++i) {
        if (field[0] !== '_' && options[field] !== undefined) {
          this[field] = options[field];
        }
      }

      return this;
    }

    get $cache() {
      return this[cache$] ??= {};
    }

    $clearCache() {
      if (this[cache$] !== undefined) {
        this[cache$] = undefined;
      }
      return this;
    }

    $cacheRef(key) {
      return this.$cache[key] ??= {};
    }
  }

  const _support = {
    setupExtras: [],

    performBumpVersion(model, _id, _version) {
      return new Query(model).onId(_id).where({_version}).inc('_version', 1).update();
    },

    async performInsert(doc) {
      doc.changes = doc.attributes;
      const attrs = doc.attributes = {};

      let err;

      try {
        await callBeforeObserver('beforeCreate', doc);
        await callBeforeObserver('beforeSave', doc);
        const attrs = doc.attributes;
        doc.attributes = doc.changes;
        doc.changes = attrs;
        doc.constructor.hasVersioning && (doc.attributes._version = 1);
        await Query.insert(doc);
      } catch (er) {
        err = er;
      }
      const subj = doc.constructor[observers$].whenFinally;
      if (subj !== undefined) {
        const iter = subj[Symbol.iterator]();
        for (let i = iter.next(); !i.done; i = iter.next()) {
          try {
            await i.value.callback(doc, err);
          } catch (err1) {
            if (err === undefined) err = err1;
          }
        }
      }
      if (err !== undefined) {
        throw err;
      }
    },

    async performUpdate(doc, changes) {
      doc.changes = changes;

      let err;

      try {
        await callBeforeObserver('beforeUpdate', doc);
        await callBeforeObserver('beforeSave', doc);
        const model = doc.constructor;
        const st = new Query(model).onId(doc._id);

        model.hasVersioning && st.inc('_version', 1);

        const {changes} = doc;
        doc.changes = {};
        await st.update(changes);
      } catch (er) {
        err = er;
      }

      const subj = doc.constructor[observers$].whenFinally;
      if (subj !== undefined) {
        const iter = subj[Symbol.iterator]();
        for (let i = iter.next(); !i.done; i = iter.next()) {
          try {
            await i.value.callback(doc, err);
          } catch (err1) {
            if (err === undefined) err = err1;
          }
        }
      }
      if (err !== undefined) {
        throw err;
      }
    },

    _updateTimestamps(changes, timestamps, now) {
      if (timestamps) {
        for (const key in timestamps) {
          if (changes[key] === undefined) {
            changes[key] = now;
          }
        }
      }
    },

    _addUserIds(changes, userIds, user_id) {
      if (userIds) {
        for (const key in userIds) {
          changes[key] ??= user_id;
        }
      }
    },

    callBeforeObserver,
    callAfterLocalChange,
  };

  const getField = (doc, field) => {
    const val = hasOwn(doc.changes, field) ? doc.changes[field] : doc.attributes[field];
    return val === null ? undefined : val;
  };

  const setField = (doc, field, value) => {
    const {changes} = doc;
    if (value === null) value = undefined;
    if (value === doc.attributes[field]) {
      if (hasOwn(changes, field)) {
        if (value === undefined && doc.constructor._defaults[field] !== undefined) {
          changes[field] = deepCopy(doc.constructor._defaults[field]);
        } else {
          delete doc.changes[field];
        }

        typeof doc._setChanges === 'function' && doc._setChanges(field, value);
      }
    } else {
      changes[field] = value;
      typeof doc._setChanges === 'function' && doc._setChanges(field, value);
    }
  };

  BaseModel.getField = getField;
  BaseModel.setField = setField;

  ('beforeCreate beforeUpdate beforeSave beforeRemove afterLocalChange whenFinally ').split(' ')
    .forEach((type) => {
      BaseModel[type] = function (callback) {
        return registerObserver(this, type, callback);
      };
    });

  const mapFieldType = (model, field, bt, name) => {
    if (!bt) throw Error(name + ' is not defined for field: ' + field);
    model.fieldTypeMap[field] = bt;
  };

  const defineField = (proto, field, accessor) => {
    Object.defineProperty(proto, field, {
      configurable: true,
      get: accessor?.get ?? getValue(field),

      set: accessor?.set ?? setValue(field),
    });
  };

  const belongsTo = (model, name, field) =>
    function () {
      const value = this[field];
      return value && model.findById(value);
    };

  const getValue = (field) =>
    function getValue() {
      return getField(this, field);
    };
  const setValue = (field) =>
    function setValue(value) {
      setField(this, field, value);
    };

  const setUpValidators = (model, field, options) => {
    const validators = getValidators(model, field);

    if (typeof options === 'object') {
      for (const validator in options) {
        const valFunc = Val.validators(validator);
        if (valFunc !== undefined) {
          validators[validator] = [valFunc, options[validator], options];
        }
      }
    }
  };

  const getValidators = (model, field) => model._fieldValidators[field] ??= {};

  const TYPE_MAP = {
    belongs_to_dbId(model, field, options) {
      options.pseudo_field = true;
      if (model.$dbIdField) {
        throw new Error('belongs_to_dbId already defined!');
      }
      model.$dbIdField = field;
      options.accessor = {set() {}};
      TYPE_MAP.belongs_to.call(this, model, field, options);
    },

    belongs_to(model, field, options) {
      if (options.accessor === undefined) {
        options.accessor = {
          get: getValue(field),
          set(value) {
            setField(this, field, value ?? undefined);
          },
        };
      }
      const name = field.replace(/_id$/, '');
      let bt = options.model, btName;
      if (!bt) {
        btName = options.modelName ?? util.capitalize(name);
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
      TYPE_MAP.belongs_to.call(this, model, field, options);
      model.userIds ??= {};
      model.userIds[field] = 'create';
    },

    has_many(model, field, options) {
      let bt = options.model, name;
      if (!bt) {
        name = options.modelName ?? util.capitalize(util.sansId(field));
        bt = ModelMap[name];
        options.model = bt;
      }
      mapFieldType(model, field, bt, name);
    },

    auto_timestamp(model, field) {
      if (/create/i.test(field)) {
        model.createTimestamps ??= {};
        model.createTimestamps[field] = true;
      } else {
        model.updateTimestamps ??= {};
        model.updateTimestamps[field] = true;
      }
    },
  };

  BaseModel[private$] = {_support};

  return BaseModel;
});

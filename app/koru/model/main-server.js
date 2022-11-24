define((require, exports, module) => {
  'use strict';
  const Changes         = require('koru/changes');
  const ModelMap        = require('koru/model/map');
  const Query           = require('koru/model/query');
  const Observable      = require('koru/observable');
  const dbBroker        = require('./db-broker');
  const TransQueue      = require('./trans-queue');
  const Val             = require('./validation');
  const driver          = require('../config!DBDriver');
  const koru            = require('../main');
  const Random          = require('../random');
  const session         = require('../session');
  const util            = require('../util');

  const {private$, error$} = require('koru/symbols');
  const pv = ModelMap[private$];
  const {makeDoc$, docCache$} = pv;

  const _resetDocs = {};

  let _support, BaseModel;

  session.registerGlobalDictionaryAdder(module, (adder) => {
    for (const mname in ModelMap) {
      adder(mname);
      const model = ModelMap[mname];
      for (let name in model.$fields) {
        adder(name);
      }
    }
    for (const name in session._rpcs) adder(name);
  });

  koru.onunload(module, () => {session.deregisterGlobalDictionaryAdder(module)});

  Changes.KEYWORDS.forEach((word) => {session.addToDict(word)});

  {
    const dbBrokerDesc = Object.getOwnPropertyDescriptor(dbBroker, 'db');

    Object.defineProperty(ModelMap, 'db', {
      enumerable: false, configurable: true,
      get: dbBrokerDesc.get, set: dbBrokerDesc.set});
  }

  const asyncFindById = async (model, id) => {
    const rec = await model.docs.findById(id);
    if (rec !== undefined) {
      const doc = new model(rec);
      model._$docCacheSet(doc);
      return doc;
    }
  };

  function findById(id) {
    if (id == null) return;
    if (typeof id !== 'string') throw new Error('invalid id: ' + id);
    let doc = this._$docCacheGet(id);
    if (doc === undefined) {
      return asyncFindById(this, id);
    }
    return doc;
  }

  const assertAuthorize = (doc) => {Val.allowAccessIf(doc.authorize !== undefined, doc)};

  const ModelEnv = {
    destroyModel(model, drop) {
      if (! model) return;
      const rd = _resetDocs[model.modelName];
      rd?.();
      if (drop === 'drop') {
        return model.db.dropTable(model.modelName);
      }
    },

    init(_BaseModel, _baseSupport) {
      BaseModel = _BaseModel;
      _support = _baseSupport;
      BaseModel.findById = findById;
      BaseModel.addUniqueIndex = addUniqueIndex;
      BaseModel.addIndex = addIndex;

      BaseModel.remoteSave = (model, id, changes, userId) => TransQueue.transaction(model.db, async () => {
        let doc = await model.findById(id ?? changes._id);

        const topLevel = (changes.$partial && Changes.topLevelChanges(doc.attributes, changes)) ??
              changes;
        if (id != null) {
          Val.allowIfFound(doc, '_id');
          doc.changes = topLevel;
        } else {
          if (doc !== undefined) return; // replay or duplicate id so don't update, don't throw error
          doc = new model(null, topLevel);
        }
        assertAuthorize(doc);
        await doc.authorize(userId);
        if (topLevel !== changes && topLevel !== undefined) {
          Changes.updateCommands(changes, doc.changes, topLevel);
          doc.changes = changes;
        }
        await doc.$save('assert');
      });

      BaseModel.remoteRemove = (model, id, userId) => TransQueue.transaction(model.db, async () => {
        const doc = await model.findById(id);
        Val.allowIfFound(doc, '_id');
        assertAuthorize(doc);
        await doc.authorize(userId, {remove: true});
        await doc.$remove();
      });

      const prepareIndex = (model, args) => {
        let filterTest;
        if (typeof args[args.length - 1] === 'function') {
          filterTest = model.query;
          args[args.length - 1](filterTest);
          --args.length;
        }
        const name = model.modelName;
        const sort = [];
        let dir = 1, from = -1;
        for (let i = 0; i < args.length; ++i) {
          const arg = args[i];
          switch (arg) {
          case 1: dir = 1; break;
          case -1: dir = -1; break;
          default:
            sort.push(arg);
            dir == -1 && sort.push(-1);
            continue;
          }
          if (from == -1) from = i;
        }
        return {model, sort, from: args.slice(from), filterTest, stop: util.voidFunc};
      };

      function addUniqueIndex(...args) {return prepareIndex(this, args)}

      function addIndex(...args) {return prepareIndex(this, args)}

      util.mergeNoEnum(ModelMap, {
        get defaultDb() {return driver.defaultDb},
      });

      BaseModel[makeDoc$] = function (attrs) {
        const doc = this._$docCacheGet(attrs._id);
        if (doc === undefined) {
          const doc = new this(attrs);
          this._$docCacheSet(doc);
          return doc;
        }
        doc.attributes = attrs;
        return doc;
      }

      BaseModel.prototype.$remove = function () {
        return new Query(this.constructor).onId(this._id).remove();
      }

      const clearDocChanges = (doc) => {
        const model = doc.constructor;
        doc.changes = {};
        if (doc[error$] !== undefined) doc[error$] = undefined;
        doc.$clearCache();
        if (model._$docCacheGet(doc._id) === undefined) {
          model._$docCacheSet(doc);
        }

        return doc;
      };

      const fullReload = async (doc) => {
        const rec = await doc.constructor.docs.findById(doc._id);
        if (rec === undefined) {
          doc.attributes = {};
        } else {
          doc.attributes = rec;
        }

        return clearDocChanges(doc);
      };

      BaseModel.prototype.$reload = function (full=false) {
        if (! full) return clearDocChanges(this);

        return fullReload(this);
      }

      ModelEnv.save = async (doc, callback) => {
        const model = doc.constructor;
        const _id = doc._id;
        let {changes} = doc; doc.changes = {};
        const now = util.newDate();

        if (doc.attributes._id == null) {
          if (! model.$fields._id.auto) {
            changes._id ??= Random.id();
          }
          _support._addUserIds(changes, model.userIds, util.thread.userId);
          _support._updateTimestamps(changes, model.createTimestamps, now);
          _support._updateTimestamps(changes, model.updateTimestamps, now);

          changes = Object.assign(doc.attributes, changes);
          await _support.performInsert(doc);
        } else {
          if (util.isObjEmpty(changes)) return doc;
          await _support.performUpdate(doc, changes);
        }
        return callback?.(doc);
      };

      const ID_ERROR = {baseName: '_id'};

      session.defineRpc('save', function (modelName, id, changes) {
        const {userId} = this;
        Val.allowAccessIf(userId);
        Val.assertCheck(id, 'string', ID_ERROR);
        const model = ModelMap[modelName];
        Val.allowIfFound(model);
        if (model.overrideSave != null) {
          return model.overrideSave(id, changes, userId);
        }
        return BaseModel.remoteSave(model, id, changes, userId);
      });

      session.defineRpc('bumpVersion', function (modelName, id, version) {
        _support.performBumpVersion(ModelMap[modelName], id, version);
      });

      session.defineRpc('remove', function (modelName, id) {
        const userId = this.userId;
        Val.allowAccessIf(userId);
        Val.ensureString(id);
        Val.ensureString(modelName);
        const model = ModelMap[modelName];
        Val.allowIfFound(model);
        if (model.overrideRemove !== undefined) {
          return model.overrideRemove(userId, id);
        }
        return BaseModel.remoteRemove(model, id, userId);
      });

      util.merge(_support, {
        resetDocs(model) {_resetDocs[model.modelName]?.()},
        bumpVersion() {
          return _support.performBumpVersion(this.constructor, this._id, this._version);
        },

        transaction: (model, func) => model.db.transaction(func),

        remote: (model, name, func) => function (...args) {
          Val.allowAccessIf(this.userId != null);
          return model.db.transaction(() => (func.apply(this, args)));
        },
      });
    },

    setupModel(model) {
      const notifyMap$ = Symbol(), docCache$ = Symbol(), dbMap$ = Symbol();
      const anyChange = new Observable();

      let docs, db;

      _resetDocs[model.modelName] = () => {
        if (db !== undefined) {
          db[dbMap$] = undefined;
          db = docs = undefined;
        }
      };

      const getDc = () => {
        const dc = util.thread[docCache$];
        return model.db === dc?.$db ? dc : undefined;
      };

      util.merge(model, {
        notify(...args) {
          const subject = model.db[notifyMap$];
          if (subject) {
            const p = subject.notify(...args);
            if (isPromise(p)) return p.then(() => anyChange.notify(...args));
          }

          return anyChange.notify(...args);
        },
        onAnyChange: (callback) => anyChange.add(callback),
        onChange(callback) {
          const subject = model.db[notifyMap$] ??= new Observable();
          return subject.onChange(callback);
        },
        get docs() {
          if (this.db === undefined) return;
          docs = docs ?? db[dbMap$];
          if (docs !== undefined) return docs;

          db[dbMap$] = docs = db.table(model.modelName, model.$fields);
          return docs;
        },
        get db() {
          const tdb = dbBroker.db;
          if (tdb !== db) {
            docs = undefined;
            db = tdb;
          }
          return db;
        },

        _$docCacheGet: (id) => getDc()?.[id],

        _$docCacheSet: (doc) => {
          const thread = util.thread;
          let dc = getDc();
          if (dc === undefined || dc.$db !== model.db) {
            dc = util.createDictionary();
            dc.$db = model.db;
            thread[docCache$] = dc;
          }
          dc[doc._id] = doc;
        },

        _$docCacheDelete: (doc) => {
          if (doc._id) {
            const dc = getDc();
            if (dc !== undefined) {
              delete dc[doc._id];
            }
          }
        },

        _$docCacheClear: () => {util.thread[docCache$] = undefined},
      });
    },
  };

  return ModelEnv;
});

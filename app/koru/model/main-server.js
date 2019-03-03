define((require, exports, module)=>{
  const Changes         = require('koru/changes');
  const ModelMap        = require('koru/model/map');
  const Query           = require('koru/model/query');
  const Observable      = require('koru/observable');
  const driver          = require('../config!DBDriver');
  const koru            = require('../main');
  const Random          = require('../random');
  const session         = require('../session');
  const util            = require('../util');
  const dbBroker        = require('./db-broker');
  const TransQueue      = require('./trans-queue');
  const Val             = require('./validation');

  const {private$, error$} = require('koru/symbols');
  const pv = ModelMap[private$];
  const {makeDoc$, docCache$} = pv;

  const _resetDocs = {};

  let _support, BaseModel;

  session.registerGlobalDictionaryAdder(module, adder => {
    for (const mname in ModelMap) {
      adder(mname);
      const model = ModelMap[mname];
      for (let name in model.$fields) {
        adder(name);
      }
    }
    for (const name in session._rpcs) adder(name);
  });

  koru.onunload(module, ()=>{session.deregisterGlobalDictionaryAdder(module)});

  Changes.KEYWORDS.forEach(word=>{session.addToDict(word)});

  {
    const dbBrokerDesc = Object.getOwnPropertyDescriptor(dbBroker, 'db');

    Object.defineProperty(ModelMap, 'db', {
      enumerable: false, configurable: true,
      get: dbBrokerDesc.get, set: dbBrokerDesc.set});
  }

  function findById(id) {
    if (id == null) return;
    if (typeof id !== 'string') throw new Error('invalid id: '+ id);
    let doc = this._$docCacheGet(id);
    if (doc === undefined) {
      const rec = this.docs.findOne({_id: id});
      if (rec !== undefined) {
        doc = new this(rec);
        this._$docCacheSet(doc);
      }
    }
    return doc;
  }

  const ModelEnv = {
    destroyModel(model, drop) {
      if (! model) return;
      if (drop === 'drop')
        model.db.dropTable(model.modelName);
      model.db = model.docs = null;
    },

    init(_BaseModel, _baseSupport) {
      BaseModel = _BaseModel;
      _support = _baseSupport;
      BaseModel.findById = findById;
      BaseModel.addUniqueIndex = addUniqueIndex;
      BaseModel.addIndex = addIndex;

      const prepareIndex = (model, args) => {
        let filterTest;
        if (typeof args[args.length-1] === 'function') {
          filterTest = model.query;
          args[args.length-1](filterTest);
          --args.length;
        }
        const name = model.modelName;
        const sort = [];
        let dir = 1, from = -1;
        for(let i = 0; i < args.length; ++i) {
          const arg = args[i];
          switch(arg) {
          case 1: dir = 1; break;
          case -1: dir = -1; break;
          default:
            sort.push(arg);
            dir == -1 && sort.push(-1);
            continue;
          }
          if (from == -1) from = i;
        }
        return {model, sort, from: args.slice(from), filterTest, stop: koru.nullFunc};
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
      };

      BaseModel.prototype.$remove =  function () {
        return new Query(this.constructor).onId(this._id).remove();
      };

      BaseModel.prototype.$reload = function (full) {
        const model = this.constructor;
        if (full) {
          const rec = model.docs.findOne({_id: this._id});
          if (rec === undefined) {
            this.attributes = {};
          } else {
            this.attributes = rec;
          }
        }

        this.changes = {};
        if (this[error$] !== undefined) this[error$] = undefined;
        this.$clearCache();
        if (model._$docCacheGet(this._id) === undefined)
          model._$docCacheSet(this);

        return this;
      };

      ModelEnv.save = (doc, callback)=>{
        const model = doc.constructor;
        const _id = doc._id;
        let {changes} = doc; doc.changes = {};
        const now = util.newDate();

        if(doc.attributes._id == null) {
          if (! model.$fields._id.auto)
            changes._id = changes._id || Random.id();
          _support._addUserIds(changes, model.userIds, util.thread.userId);
          _support._updateTimestamps(changes, model.createTimestamps, now);
          _support._updateTimestamps(changes, model.updateTimestamps, now);

          changes = Object.assign(doc.attributes, changes);
          _support.performInsert(doc);
        } else {
          if (util.isObjEmpty(changes)) return doc;
          _support.performUpdate(doc, changes);
        }
        if (callback) callback(doc);
      };

      const ID_ERROR = {baseName: '_id'};

      session.defineRpc("save", function (modelName, id, changes) {
        const {userId} = this;
        Val.allowAccessIf(userId);
        Val.assertCheck(id, 'string', ID_ERROR);
        const model = ModelMap[modelName];
        Val.allowIfFound(model);
        TransQueue.transaction(model.db, () => {
          if (model.overrideSave)
            return model.overrideSave(id, changes, userId);
          let doc = model.findById(id || changes._id);

          const topLevel = (changes.$partial && Changes.topLevelChanges(doc.attributes, changes)) ||
                changes;
          if (id) {
            Val.allowIfFound(doc, '_id');
            doc.changes = topLevel;
          } else {
            if (doc) return; // replay or duplicate id so don't update, don't throw error
            doc = new model(null, topLevel);
          }
          Val.allowAccessIf(doc.authorize);
          doc.authorize(userId);
          doc.$assertValid();
          if (topLevel !== undefined) {
            Changes.updateCommands(changes, doc.changes, topLevel);
            doc.changes = changes;
          }
          doc.$save('force');
        });
      });

      session.defineRpc("bumpVersion", function(modelName, id, version) {
        _support.performBumpVersion(ModelMap[modelName], id, version);
      });

      session.defineRpc("remove", function (modelName, id) {
        const userId = this.userId;
        Val.allowAccessIf(userId);
        Val.ensureString(id);
        Val.ensureString(modelName);
        const model = ModelMap[modelName];
        Val.allowIfFound(model);
        TransQueue.transaction(model.db, () => {
          const doc = model.findById(id);
          Val.allowIfFound(doc, '_id');
          if (doc.overrideRemove)
            doc.overrideRemove(userId);
          else {
            Val.allowAccessIf(doc.authorize);
            doc.authorize(userId, {remove: true});
            doc.$remove();
          }
        });
      });

      util.merge(_support, {
        resetDocs(model) {
          if (_resetDocs[model.modelName] !== undefined)
            _resetDocs[model.modelName]();
        },
        bumpVersion() {
          _support.performBumpVersion(this.constructor, this._id,this._version);
        },

        transaction(model, func) {
          return model.db.transaction(func);
        },

        remote(model, name, func) {
          return function (...args) {
            Val.allowAccessIf(this.userId);
            return model.db.transaction(() => (func.apply(this, args)));
          };
        },
      });
    },

    setupModel(model) {
      const notifyMap$ = Symbol(), docCache$ = Symbol(), dbMap$ = Symbol();
      const anyChange = new Observable();

      let docs, db;

      _resetDocs[model.modelName] = ()=>{
        if (db !== undefined) {
          db[dbMap$] = undefined;
          db = docs = undefined;
        }
      };

      const getDc = ()=>{
        const dc = util.thread[docCache$];
        return dc && model.db === dc.$db ? dc : undefined;
      };

      util.merge(model, {
        notify(...args) {
          const subject = model.db[notifyMap$];
          if (subject)
            subject.notify(...args);

          anyChange.notify(...args);
        },
        onAnyChange: callback => anyChange.add(callback),
        onChange(callback) {
          const subject = model.db[notifyMap$] || (model.db[notifyMap$] =  new Observable());
          return subject.onChange(callback);
        },
        get docs() {
          if (this.db === undefined) return;
          docs = docs || db[dbMap$];
          if (docs) return docs;

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

        _$docCacheGet(id) {
          const dc = getDc();
          if (dc !== undefined)
            return dc[id];
        },

        _$docCacheSet(doc) {
          const thread = util.thread;
          let dc = getDc();
          if (dc === undefined || dc.$db !== model.db) {
            dc = util.createDictionary();
            dc.$db = model.db;
            thread[docCache$] = dc;
          }
          dc[doc._id] = doc;
        },

        _$docCacheDelete(doc) {
          if (doc._id) {
            const dc = getDc();
            if (dc !== undefined)
              delete dc[doc._id];
          }
        },

        _$docCacheClear() {
          return util.thread[docCache$] = undefined;
        },
      });
    },
  };

  return ModelEnv;
});

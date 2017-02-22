define(function(require, exports, module) {
  const Query       = require('koru/model/query');
  const driver      = require('../config!DBDriver');
  const koru        = require('../main');
  const makeSubject = require('../make-subject');
  const Random      = require('../random');
  const session     = require('../session');
  const util        = require('../util');
  const dbBroker    = require('./db-broker');
  const TransQueue  = require('./trans-queue');
  const Val         = require('./validation');

  let _support, BaseModel, ModelMap;

  const uniqueIndexes = {};
  const indexes = {};
  const _resetDocs = {};

  session.registerGlobalDictionaryAdder(module, addToDictionary);

  koru.onunload(module, function () {
    session.deregisterGlobalDictionaryAdder(module);
  });

  const ModelEnv = {
    destroyModel(model, drop) {
      if (! model) return;
      if (drop === 'drop')
        model.db.dropTable(model.modelName);
      model.db = model.docs = null;

      delete uniqueIndexes[model.modelName];
      delete indexes[model.modelName];
    },

    init(_ModelMap, _BaseModel, _baseSupport) {
      ModelMap = _ModelMap;
      BaseModel = _BaseModel;
      _support = _baseSupport;
      BaseModel.findById = findById;
      BaseModel.findAttrsById = findAttrsById;
      BaseModel.addUniqueIndex = addUniqueIndex;
      BaseModel.addIndex = addIndex;

      function addUniqueIndex(...args) {
        prepareIndex(uniqueIndexes, this, args);
      }

      function ensureIndex(model, args, opts) {
        if (util.Fiber.current) ensureIndex();
        else util.Fiber(ensureIndex).run();

        function ensureIndex() {
          model.docs.ensureIndex(buidlKeys(args), opts);
        }
      }

      function addIndex(...args) {
        prepareIndex(indexes, this, args);
      }

      function prepareIndex(type, model, args) {
        const name = model.modelName;
        const queue = type[name] || (type[name] = []);
        queue.push(args);
      }

      function _ensureIndexes(type, options) {
        for(let name in type) {
          const queue = type[name];
          const model = ModelMap[name];
          util.forEach(queue, args => {ensureIndex(model, args, options)});
        }
      }

      function ensureIndexes () {
        _ensureIndexes(uniqueIndexes, {unique : true, sparse: true});
        _ensureIndexes(indexes);
      }

      util.mergeNoEnum(ModelMap, {
        ensureIndexes,
        get defaultDb() {return driver.defaultDb},
      });

      BaseModel.prototype.$remove =  function () {
        return new Query(this.constructor).onId(this._id).remove();
      };

      BaseModel.prototype.$reload = function (full) {
        const model = this.constructor;
        const doc = full ? model.docs.findOne({_id: this._id}) : model.findAttrsById(this._id);

        if (doc) {
          full && model._$docCacheSet(doc);
          this.attributes = doc;
        } else {
          model._$docCacheDelete(this);
          this.attributes = {};
        }
        this.changes = {};
        this._errors = null;
        this._cache = null;

        return this;
      };

      ModelEnv.save = function (doc, callback) {
        if (util.isObjEmpty(doc.changes)) return doc;
        const model = doc.constructor;
        const _id = doc._id;
        let {changes} = doc; doc.changes = {};
        const now = util.newDate();

        _support._updateTimestamps(changes, model.updateTimestamps, now);
        if(doc.attributes._id == null) {
          if (! model.$fields._id.auto)
            changes._id = changes._id || Random.id();
          _support._addUserIds(changes, model.userIds, util.thread.userId);
          _support._updateTimestamps(changes, model.createTimestamps, now);

          changes = util.merge(doc.attributes, changes);
          _support.performInsert(doc);
        } else {
          const copy = util.deepCopy(changes);
          _support.performUpdate(doc, changes);

          // This a bit of a hack; should we bother?
          util.applyChanges(doc.attributes, copy);
        }
        if (callback) callback(doc);
      };

      ModelEnv.put = function (doc, updates) {
        session.rpc('put', doc.constructor.modelName, doc._id, updates);
      };

      session.defineRpc("save", function (modelName, id, changes) {
        const userId = this.userId;
        Val.allowAccessIf(userId);
        Val.assertCheck(id, 'string', {baseName: '_id'});
        Val.assertCheck(modelName, 'string', {baseName: 'modelName'});
        const model = ModelMap[modelName];
        Val.allowIfFound(model);
        TransQueue.transaction(model.db, function () {
          if (model.overrideSave)
            return model.overrideSave(id, changes, userId);
          let doc = model.findById(id || changes._id);

          if (id) Val.allowIfFound(doc);
          else {
            if (doc) return; // replay or duplicate id so don't update, don't throw error
            doc = new model();
          }

          doc.changes = changes;
          Val.allowAccessIf(doc.authorize);
          doc.authorize(userId);
          doc.$assertValid();
          doc.$save();
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
        TransQueue.transaction(model.db, function () {
          const doc = model.findById(id);
          Val.allowIfFound(doc);
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
          if (_resetDocs.hasOwnProperty(model.modelName))
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
            return model.db.transaction(
              () => (Val.allowAccessIf(this.userId), func.apply(this, args)));
          };
        },
      });
    },

    setupModel(model) {
      const notifyMap = new WeakMap;
      const anyChange = makeSubject({});

      const docCache = new WeakMap;
      let dbMap = new WeakMap;

      let docs, db;

      _resetDocs[model.modelName] = function () {
        db = docs = null;
        dbMap = new WeakMap;
      };

      function getDc() {
        const dc = docCache.get(util.thread);
        return dc && model.db === dc.$db && dc;
      }

      util.merge(model, {
        notify(...args) {
          const subject = notifyMap.get(model.db);
          if (subject)
            subject.notify.apply(subject, args);

          anyChange.notify.apply(subject, args);
        },
        onAnyChange: anyChange.onChange,
        onChange(...args) {
          let subject = notifyMap.get(model.db);
          subject || notifyMap.set(db, subject = makeSubject({}));

          return subject.onChange.apply(subject, args);
        },
        get docs() {
          if (! this.db) return;
          docs = docs || dbMap.get(db);
          if (docs) return docs;

          dbMap.set(db, docs = db.table(model.modelName, model.$fields));
          return docs;
        },
        get db() {
          const tdb = dbBroker.db;
          if (tdb !== db) {
            docs = null;
            db = tdb;
          }
          return db;
        },

        _$docCacheGet(id) {
          const dc = getDc();
          if (dc)
            return dc[id];
        },

        _$docCacheSet(doc) {
          const thread = util.thread;
          let dc = getDc();
          if (! dc || dc.$db !== model.db) {
            dc = Object.create(null);
            dc.$db = null; delete dc.$db; // de-op object
            dc.$db = model.db;
            docCache.set(thread, dc);
          }
          dc[doc._id] = doc;
        },

        _$docCacheDelete(doc) {
          if (doc._id) {
            const dc = getDc();
            if (dc)
              delete dc[doc._id];
          }
        },

        _$docCacheClear() {
          return docCache.delete(util.thread);
        },
      });
    },
  };

  function buidlKeys(args) {
    const keys = {};
    for(let i = 0; i < args.length; ++i) {
      const name = args[i];
      if (typeof args[i + 1] === 'number')
        keys[name] = args[++i];
      else
        keys[name] = 1;
    }
    return keys;
  }

  function findAttrsById(id) {
    if (! id) return;
    if (typeof id !== 'string') throw new Error('invalid id: '+ id);
    let doc = this._$docCacheGet(id);
    if (! doc) {
      doc = this.docs.findOne({_id: id});
      doc && this._$docCacheSet(doc);
    }
    return doc;
  }

  function findById(id) {
    const doc = this.findAttrsById(id);
    if (doc) return new this(doc);
  }

  function addToDictionary(adder) {
    for (let mname in ModelMap) {
      adder(mname);
      const model = ModelMap[mname];
      for (let name in model.$fields) {
        adder(name);
      }
    }
  }

  return ModelEnv;
});

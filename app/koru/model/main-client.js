define(function(require, exports, module) {
  'use strict';
  const koru        = require('koru');
  const makeSubject = require('koru/make-subject');
  const Query       = require('koru/model/query');
  const Random      = require('koru/random');
  const session     = require('koru/session/client-rpc');
  const {stopGap$}  = require('koru/symbols');
  const util        = require('koru/util');
  const dbBroker    = require('./db-broker');
  const clientIndex = require('./index-client');

  let _support, ModelMap;

  const dbs = Object.create(null);

  function getProp(dbId, modelName, prop) {
    const obj = dbs[dbId];
    if (obj === undefined) return undefined;
    const map = obj[modelName];
    return map === undefined ? undefined : map[prop];
  }

  function getSetProp(dbId, modelName, prop, setter) {
    const obj = dbs[dbId] === undefined ? (dbs[dbId] = {}) : dbs[dbId];
    const map = obj[modelName] ? obj[modelName] : (obj[modelName] = {});
    const ans = map[prop];
    return ans !== undefined ? ans : (map[prop] = setter());
  }


  const ModelEnv = {
    save: save,

    destroyModel(model, drop) {
      if (! model) return;

      let modelName = model.modelName;

      for (let dbId in dbs) {
        delete dbs[dbId][modelName];
      }
    },

    init(_ModelMap, BaseModel, supportBase) {
      ModelMap = _ModelMap;
      _support = supportBase;

      Object.defineProperty(ModelMap, '_databases', {enumerable: false, get() {return dbs}});
      Object.defineProperty(ModelMap, '_getProp', {enumerable: false, value: getProp});
      Object.defineProperty(ModelMap, '_getSetProp', {enumerable: false, value: getSetProp});

      util.merge(BaseModel, {
        findById,
        findAttrsById,
        get serverQuery() {
          const query = new Query(this);
          query.isFromServer = true;
          return query;
        },
        createStopGap(attrs) {
          const doc = this.build(attrs, true);
          doc[stopGap$] = true;
          doc.$isValid();
          if (doc._errors !== undefined) doc._errors = undefined;
          doc.$save('force');
          return doc;
        },
      });

      util.merge(BaseModel.prototype, {
        $remove() {
          session.rpc("remove", this.constructor.modelName, this._id,
                      koru.globalCallback);
        },

        /**
         * Warning: $reload does not ensure that this doc belongs to the
         * current database.
         **/
        $reload() {
          const doc = this.constructor.findById(this._id);
          this.attributes = doc ? doc.attributes : {};
          this.changes = {};
          if (this._errors !== undefined) this._errors = undefined;
          if (this._cache !== undefined) this._cache = undefined;
          return this;
        }
      });

      session.defineRpc("save", function (modelName, id, changes) {
        const model = ModelMap[modelName],
            docs = model.docs,
            doc = docs[id || changes._id],
            now = util.newDate();


        if (doc) {
          if (id) {
            localUpdate(doc, changes, this.userId);
          }
        } else if (! id) {
          localInsert(new model(changes), this.userId);
        }
      });

      session.defineRpc("remove", function (modelName, id) {
        return new Query(ModelMap[modelName]).onId(id).remove();
      });

      session.defineRpc("bumpVersion", function(modelName, id, version) {
        _support.performBumpVersion(ModelMap[modelName], id, version);
      });

      util.merge(_support, {
        resetDocs() {},
        bumpVersion() {
          session.rpc('bumpVersion', this.constructor.modelName, this._id, this._version);
        },

        transaction(model, func) {
          return func();
        },

        remote(model, name, func) {
          return func;
        },
      });
    },

    setupModel(model) {
      const modelName = model.modelName;
      let dbId, docs;

      function chkdb() {
        const tdbId = dbBroker.dbId;
        if (tdbId !== dbId) {
          docs = null;
          dbId = tdbId;
        }
        return dbId;
      }

      Object.defineProperty(model, 'dbId', {configurable: true, get: chkdb});

      function setDocs() {
        const obj = Object.create(null);
        obj.x = 1;
        delete obj.x; // try to make JSVM use dictionary mode
        return obj;
      }
      const anyChange = makeSubject({});

      util.merge(model, {
        notify(...args) {
          chkdb();
          const subject = getProp(dbId, modelName, 'notify');
          if (subject)
            subject.notify(...args);

          anyChange.notify.apply(subject, args);
        },
        onAnyChange: anyChange.onChange,
        onChange(callback) {
          chkdb();
          const subject = getSetProp(dbId, modelName, 'notify', () => makeSubject({}));

          return subject.onChange(callback);
        },

        get docs() {
          chkdb();
          if (docs) return docs;
          docs = getSetProp(dbId, modelName, 'docs', setDocs);
          return docs;
        },
        set docs(value) {
          chkdb();
          docs = docs || getSetProp(dbId, modelName, 'docs', () => value);
          dbs[dbId][modelName].docs = value;
          docs = value;
          model._indexUpdate.reloadAll();
        },
      });
      clientIndex(model);
    },
  };

  function findById(id) {return this.docs[id]}

  function findAttrsById(id) {
    const doc = this.docs[id];
    return doc && doc.attributes;
  }

  function localInsert(doc, userId) {
    const model = doc.constructor;
    const changes = doc.attributes;
    const now = util.newDate();
    _support._updateTimestamps(changes, model.updateTimestamps, now);

    _support._addUserIds(doc.attributes, model.userIds, userId);
    _support._updateTimestamps(changes, model.createTimestamps, now);
    _support.performInsert(doc);
  }

  function localUpdate(doc, changes, userId) {
    const model = doc.constructor;
    const now = util.newDate();
    _support.performUpdate(doc, changes);
  }

  function save(doc, callback=koru.globalCallback) {
    let _id = doc.attributes._id;
    const model = doc.constructor;

    if(_id == null) {
      if (! doc.changes._id) doc.changes._id = Random.id();
      _id = doc.changes._id;
      if (model.docs[_id]) throw new koru.Error(400, {_id: [['not_unique']]});
      if (doc[stopGap$]) {
        doc.attributes = doc.changes;
        doc.changes = {};
        localInsert(doc, koru.userId());
      } else
        session.rpc("save", model.modelName, null, doc.changes, callback);
    } else for(let noop in doc.changes) {
      // only call if at least one change
      const changes = doc.changes;
      doc.changes = {}; // reset changes here for callbacks
      if (doc[stopGap$])
        localUpdate(doc, changes, koru.userId());
      else
        session.rpc("save", model.modelName, _id, changes, callback);
      break;
    }
    doc.$reload();
  }

  return ModelEnv;
});

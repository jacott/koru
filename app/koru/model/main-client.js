define(function(require, exports, module) {
  'use strict';
  const koru        = require('koru');
  const makeSubject = require('koru/make-subject');
  const Random      = require('koru/random');
  const session     = require('koru/session/client-rpc');
  const util        = require('koru/util');
  const dbBroker    = require('./db-broker');
  const clientIndex = require('./index-client');
  const Query       = require('./query');

  var _support;

  var dbs = Object.create(null);

  function getProp(dbId, modelName, prop) {
    var obj = dbs[dbId];
    if (! obj) return false;
    obj = obj[modelName];
    return (obj && obj[prop]) || false;
  }

  function getSetProp(dbId, modelName, prop, setter) {
    var obj = dbs[dbId] || (dbs[dbId] = {});
    obj = obj[modelName] || (obj[modelName] = {});

    return obj[prop] || (obj[prop] = setter());
  }

  var ModelEnv = {
    save: save,
    put: put,

    destroyModel(model, drop) {
      if (! model) return;

      let modelName = model.modelName;

      for (let dbId in dbs) {
        delete dbs[dbId][modelName];
      }
    },

    init(BaseModel, supportBase, modelProperties) {
      _support = supportBase;

      Object.defineProperty(BaseModel, '_databases', {enumerable: false, get() {return dbs}});
      Object.defineProperty(BaseModel, '_getProp', {enumerable: false, value: getProp});
      Object.defineProperty(BaseModel, '_getSetProp', {enumerable: false, value: getSetProp});

      util.extend(modelProperties, {
        findById: findById,
        findAttrsById: findAttrsById,
        get serverQuery() {
          var query = new Query(this);
          query.isFromServer = true;
          return query;
        }
      });

      BaseModel.prototype.$remove =  function () {
        session.rpc("remove", this.constructor.modelName, this._id,
                    koru.globalCallback);
      };

      /**
       * Warning: $reload does not ensure that this doc belongs to the
       * current database.
       **/
      BaseModel.prototype.$reload = function () {
        var doc = this.constructor.findById(this._id);
        this.attributes = doc ? doc.attributes : {};
        this.changes = {};
        this._errors = null;
        this._cache = null;
        return this;
      };

      session.defineRpc("save", function (modelName, id, changes) {
        var model = BaseModel[modelName],
            docs = model.docs,
            doc = docs[id],
            now = util.newDate();

        BaseModel._updateTimestamps(changes, model.updateTimestamps, now);

        if(doc) {
          _support.performUpdate(doc, changes);
        } else {
          BaseModel._addUserIds(changes, model.userIds, this.userId);
          BaseModel._updateTimestamps(changes, model.createTimestamps, now);
          changes._id = id;
          _support.performInsert(new model(changes));
        }
      });

      session.defineRpc("remove", function (modelName, id) {
        return new Query(BaseModel[modelName]).onId(id).remove();
      });

      session.defineRpc("bumpVersion", function(modelName, id, version) {
        _support.performBumpVersion(BaseModel[modelName], id, version);
      });

      util.extend(_support, {
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
      var modelName = model.modelName;
      var dbId, docs;

      function chkdb() {
        var tdbId = dbBroker.dbId;
        if (tdbId !== dbId) {
          docs = null;
          dbId = tdbId;
        }
        return dbId;
      }

      Object.defineProperty(model, 'dbId', {configurable: true, get: chkdb});

      function setDocs() {
        var obj = Object.create(null);
        obj.x = 1;
        delete obj.x; // try to make JSVM use dictionary mode
        return obj;
      }
      var anyChange = makeSubject({});

      util.extend(model, {
        notify() {
          chkdb();
          var subject = getProp(dbId, modelName, 'notify');
          if (subject)
            subject.notify.apply(subject, arguments);

          anyChange.notify.apply(subject, arguments);
        },
        onAnyChange: anyChange.onChange,
        onChange() {
          chkdb();
          var subject = getSetProp(dbId, modelName, 'notify', () => makeSubject({}));

          return subject.onChange.apply(subject, arguments);
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

    insert: Query.insert,

    _insertAttrs(model, attrs) {
      if (! attrs._id) attrs._id = Random.id();
      model.docs[attrs._id] = new model(attrs);
    },
  };

  function findById (id) {
    return this.docs[id];
  }

  function findAttrsById(id) {
    var doc = this.docs[id];
    return doc && doc.attributes;
  }

  function save(doc) {
    var _id = doc.attributes._id;

    if(_id == null) {
      _id = (doc.changes && doc.changes._id) || Random.id();
      session.rpc("save", doc.constructor.modelName, _id,
                  doc.changes,
                  koru.globalCallback);
      doc.attributes._id = _id;
    } else for(var noop in doc.changes) {
      // only call if at least one change
      var changes = doc.changes;
      doc.changes = {}; // reset changes here for callbacks
      session.rpc("save", doc.constructor.modelName, doc._id,
                  changes,
                  koru.globalCallback);
      break;
    }
    doc.$reload();
  }

  function put(doc, updates) {
    _support.validatePut(doc, updates);
    session.rpc('put', doc.constructor.modelName, doc._id, updates);
  }

  return ModelEnv;
});

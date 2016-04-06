define(function(require, exports, module) {
  var koru = require('../main');
  var util = koru.util;
  var Random = require('../random');
  var session = require('../session/client-rpc');
  var clientIndex = require('./index-client');
  var Query = require('./query');

  var _support;

  var ModelEnv = {
    save: save,
    put: put,

    destroyModel: function (model, drop) {
      if (! model) return;
      model.docs = null;
      Query._destroyModel(model);
    },

    init: function (BaseModel, supportBase, modelProperties) {
      _support = supportBase;

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
        resetDocs: function () {},
        bumpVersion: function () {
          session.rpc('bumpVersion', this.constructor.modelName, this._id, this._version);
        },

        transaction: function (model, func) {
          return func();
        },

        remote: function (model, name, func) {
          return func;
        },
      });
    },

    setupModel: function (model) {
      model.docs = {};
      clientIndex(model);
    },

    insert: Query.insert,

    _insertAttrs: function (model, attrs) {
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

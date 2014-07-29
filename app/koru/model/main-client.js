define(function(require, exports, module) {
  var koru = require('../main');
  var util = koru.util;
  var Random = require('../random');
  var session = require('../session/client-rpc');
  var clientIndex = require('./index-client');
  var Query = require('./query');

  var _support;

  var modelEnv = {
    $save: function(force) {
      var doc = this;
      doc.$isValid();
      if (force === 'force' || !doc._errors)
        return save(doc);

      return false;
    },

    $$save: function() {
      var doc = this;
      doc.$assertValid();

      return save(doc);
    },

    destroyModel: function (model, drop) {
      if (! model) return;
      model.docs = null;
      Query._destroyModel(model);
    },

    init: function (BaseModel, supportBase, modelProperties) {
      _support = supportBase;
      modelProperties.findById = findById;

      BaseModel.prototype.$remove =  function () {
        session.rpc("remove", this.constructor.modelName, this._id,
                    koru.globalCallback);
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
        BaseModel._callBeforeObserver('beforeRemove', BaseModel[modelName].docs[id]);
        return new Query(BaseModel[modelName]).onId(id).remove();
      });

      session.defineRpc("bumpVersion", function(modelName, id, version) {
        _support.performBumpVersion(BaseModel[modelName], id, version);
      });

      util.extend(_support, {
        bumpVersion: function () {
          session.rpc('bumpVersion', this.constructor.modelName, this._id, this._version);
        },

        remote: function (name, func) {
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
      model.docs[attrs._id] = new model(attrs);
    },
  };

  function findById (id) {
    return this.docs[id];
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

    return doc.$reload();
  }

  return modelEnv;
});

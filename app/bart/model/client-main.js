define(function(require, exports, module) {
  var core = require('bart/core');
  var util = core.util;
  var Random = require('../random');
  var session = require('../session/client-main');
  var clientIndex = require('./client-index');

  var env = {
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

    session: session,

    destroyModel: function (model, drop) {
      if (! model) return;
      model.docs = null;
    },

    init: function (BaseModel, _support, modelProperties) {
      modelProperties.findById = findById;

      session.defineRpc("save", function (modelName, id, changes) {
        try {
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
        } catch(e) {
          throw e;
        }
      });


      session.defineRpc("bumpVersion", function(modelName, id, version) {
        _support.performBumpVersion(BaseModel[modelName], id, version);
      });

      util.extend(_support, {
        bumpVersion: function () {
          session.rpc('bumpVersion', this.constructor.modelName, this._id, this._version);
        },

        remote: function (name,func) {
          return func;
        },
      });
    },

    setupModel: function (model) {
      model.docs = {};
      clientIndex(model);
    },

    insert: function (doc) {
      var model = doc.constructor;
      model.docs[doc._id] = doc;
      model.notify(doc, null);
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
                  core.error);
      doc.attributes._id = _id;
    } else for(var noop in doc.changes) {
      // only call if at least one change
      var changes = doc.changes;
      doc.changes = {}; // reset changes here for callbacks
      session.rpc("save", doc.constructor.modelName, doc._id,
                  changes,
                  core.error);
      break;
    }

    return doc.$reload();
  }

  return env;
});

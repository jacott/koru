define(function(require, exports, module) {
  var core = require('bart/core');
  var util = core.util;
  var Random = require('../random');
  var session = require('../session/server-main');
  var Val = require('./validation');
  var mongoDb = require('../mongo/driver');

  var save;

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

    destroyModel: function (model, drop) {
      if (! model) return;
      if (drop === 'drop')
        mongoDb.defaultDb.dropCollection(model.modelName);
      model.docs = null;
    },

    init: function (BaseModel, _support, modelProperties) {
      modelProperties.findById = findById;

      save = function (doc) {
        var model = doc.constructor;
        var _id = doc._id;
        var changes = doc.changes;
        var now = util.newDate();
        doc.changes = {};

        BaseModel._updateTimestamps(changes, model.updateTimestamps, now);
        if(doc.attributes._id == null) {
          changes._id = changes._id || Random.id();
          BaseModel._addUserIds(changes, model.userIds, util.thread.userId);
          BaseModel._updateTimestamps(changes, model.createTimestamps, now);

          changes = util.extend(doc.attributes,changes);
          _support.performInsert(doc);
        } else {
          _support.performUpdate(doc, changes);
        }

        return doc;
      };

      session.defineRpc("save", function (modelName, id, changes) {
        try {
          Val.ensureString(id);
          Val.ensureString(modelName);
          var model = BaseModel[modelName];
          Val.allowIfFound(model);
          var doc = model.findById(id);
          if (! doc) {
            doc = new model();
            changes._id = id;
          }

          doc.changes = changes;
          Val.allowAccessIf(doc.authorize);
          doc.authorize(this.userId);
          doc.$assertValid();
          doc.$save();
        } catch(e) {
          throw e;
        }
      });

      session.defineRpc("bumpVersion", function(modelName, id, version) {
        _support.performBumpVersion(BaseModel[modelName], id, version);
      });

      util.extend(_support, {
        bumpVersion: function () {
          _support.performBumpVersion(this.constructor, this._id,this._version);
        },

        remote: function (name,func) {
          return func;
        },
      });
    },

    setupModel: function (model) {
      var docs;
      Object.defineProperty(model, 'docs', {
        get: function () {
          return docs = docs || mongoDb.defaultDb.collection(model.modelName);
        }
      });
    },

    insert: function (doc) {
      var model = doc.constructor;
      model.docs.insert(doc.attributes);
      model.notify(doc, null);
    },
  };

  function findById (id) {
    var doc = this.docs.findOne({_id: id});
    if (doc) return new this(doc);
  }

  return env;
});

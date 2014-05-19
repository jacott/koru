define(function(require, exports, module) {
  var core = require('bart/core');
  var util = core.util;
  var Random = require('../random');
  var session = require('../session/client-main');

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

    init: function (BaseModel, _support) {
      session.defineRpc("save", function (modelName, id, changes) {
        try {
          var model = BaseModel[modelName],
              docs = model.docs,
              doc = docs[id],
              now = util.newDate();

          BaseModel._updateTimestamps(changes, model.updateTimestamps, now);

          if(doc) {
            doc.changes = changes;
            _support.performUpdate(doc);
          } else {
            BaseModel._addUserIds(changes, model.userIds, this.userId);
            BaseModel._updateTimestamps(changes, model.createTimestamps, now);
            changes._id = id;
            doc = new model();
            doc.attributes = doc.changes = changes;

            _support.performInsert(doc, changes);
          }
        } catch(e) {
          throw e;
        }
      });

      session.defineRpc("bumpVersion", function(modelName, id, version) {
        _support.performBumpVersion(BaseModel[modelName], id, version);
      });

      util.extend(_support, {
        remote: function (name,func) {
          return func;
        },
      });
    },

    insert: function (doc) {
      var model = doc.constructor;
      model.docs[doc._id] = doc;
      model.notify(doc, 'insert');
    },
  };

  function save(doc) {
    var _id = doc.attributes._id;

    if(_id == null) {
      _id = (doc.changes && doc.changes._id) || Random.id();
      session.rpc("save", doc.constructor.modelName, _id, util.extend({},doc.changes),
                  core.error);
      doc.attributes._id = _id;
    } else for(var noop in doc.changes) {
      // only call if at least one change
      // copy changes in case they are modified
      session.rpc("save", doc.constructor.modelName, doc._id, util.extend({},doc.changes), core.error);
      break;
    }

    return doc.$reload();
  }

  return env;
});

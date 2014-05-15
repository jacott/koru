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
  };

  function save(doc) {
    var _id = doc.attributes._id;

    if(_id == null) {
      _id = (doc.changes && doc.changes._id) || Random.id();
      session.rpc(remoteName(doc,'save'), _id, util.extend(doc.attributes,doc.changes),
                  core.error);
      doc.attributes._id = _id;
    } else for(var noop in doc.changes) {
      // only call if at least one change
      // copy changes in case they are modified
      session.rpc(remoteName(doc,'save'), doc._id, util.extend({},doc.changes), core.error);
      break;
    }

    return doc.$reload();
  }

  function remoteName(doc,name) {
    return doc.constructor.modelName + '.' + name;
  }

  return env;
});

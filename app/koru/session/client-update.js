define(function(require, exports, module) {
  var koru = require('../main');
  var Model = require('../model/base');
  var Query = require('../model/query');
  var ModelEnv = require('../model/main-client');
  var publish = require('./publish');
  var message = require('./message');
  var util = require('../util');
  var Trace = require('../trace');

  var debug_clientUpdate = false;
  Trace.debug_clientUpdate = function (value) {
    debug_clientUpdate = value;
  };

  return function (session) {
    session.provide('A', modelUpdate(added, 'Add'));
    session.provide('C', modelUpdate(changed, 'Upd'));
    session.provide('R', modelUpdate(removed, 'Rem'));

    function added(model, id, attrs) {
      attrs._id = id;
      var doc = new model(attrs);
      publish.match.has(doc) && Query.insertFromServer(model, id, attrs);
    }

    function changed(model, id, attrs) {
      attrs._id = id;
      var query = model.serverQuery.onId(id);
      var doc = model.findById(id);
      if (doc && publish.match.has(doc)) {
        doc._cache = null;
        query.update(attrs);
      } else
        query.remove();
    }

    function removed(model, id) {
      model.serverQuery.onId(id).remove();
    }

    function modelUpdate(func, type) {
      return function (data) {
        data = message.decodeMessage(data, session.globalDict);
        if (debug_clientUpdate) {
          if (debug_clientUpdate === true || debug_clientUpdate[data[0]])
            koru.logger("Debug"+type, '< ' + util.inspect(data));
        }
        session.isUpdateFromServer = true;
        try {
          func.call(this, Model[data[0]], data[1], data[2]);
        } finally {
          session.isUpdateFromServer = false;
        }
      };
    }

    return {
      unload: function () {
        session.unprovide('A');
        session.unprovide('C');
        session.unprovide('R');
      },
    };
  };
});

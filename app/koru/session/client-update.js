define(function(require, exports, module) {
  var koru = require('../main');
  var Model = require('../model/base');
  var Query = require('../model/query');
  var ModelEnv = require('../model/main-client');
  var publish = require('./publish');
  var message = require('./message');
  var util = require('../util');


  return function (session) {
    session.provide('A', modelUpdate(added));
    session.provide('C', modelUpdate(changed));
    session.provide('R', modelUpdate(removed));

    session.isUpdateFromServer = false;

    function added(model, id, attrs) {
      attrs._id = id;
      var doc = new model(attrs);
      publish.match.has(doc) && Query.insertFromServer(model, id, attrs);
    }

    function changed(model, id, attrs) {
      attrs._id = id;
      var doc = model.findById(id);
      var query = new Query(model).onId(id);
      if (publish.match.has(doc))
        query.update(attrs);
      else
        query.remove();
    }

    function removed(model, id) {
      new Query(model).onId(id).remove();
    }

    function modelUpdate(func) {
      return function (data) {
        data = message.decodeMessage(data);
        koru._debugUpdates && console.log("Update: " + util.inspect(data));
        try {
          session.isUpdateFromServer = true;
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

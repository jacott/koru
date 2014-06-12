define(function(require, exports, module) {
  var env = require('../env');
  var Model = require('../model/main');
  var session = require('./main');
  var Query = require('../model/query');
  var ModelEnv = require('../model/main-client');
  var publish = require('./publish');
  var message = require('./message');

  session.provide('A', modelUpdate(added));
  session.provide('C', modelUpdate(changed));
  session.provide('R', removed);

  function added(model, id, attrs) {
    attrs._id = id;
    var doc = new model(attrs);
    publish._matches(doc) && Query.insertFromServer(model, id, attrs);
  }

  function changed(model, id, attrs) {
    attrs._id = id;
    var doc = model.findById(id);
    var query = new Query(model).fromServer(id);
    if (publish._matches(doc))
      query.update(attrs);
    else
      query.remove();
  }

  function removed(data) {
    data = message.decodeMessage(data);
    var model = Model[data[0]];
    var id =  data[1];
    new Query(model).fromServer(id).remove();
  }

  function modelUpdate(func) {
    return function (data) {
      data = message.decodeMessage(data);
      func.call(this, Model[data[0]], data[1], data[2]);
    };
  }
});

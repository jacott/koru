define(function(require, exports, module) {
  var env = require('../env');
  var Model = require('../model/main');
  var session = require('./main');
  var Query = require('../model/query');
  var ModelEnv = require('../model/main-client');
  var publish = require('./publish');

  session.provide('A', modelUpdate(added));
  session.provide('C', modelUpdate(changed));
  session.provide('R', removed);

  function added(model, id, attrs) {
    attrs._id = id;
    var doc = new model(attrs);
    publish._matches(doc) && ModelEnv.insert(doc);
  }

  function changed(model, id, attrs) {
    attrs._id = id;
    var doc = model.findById(id);
    var query = new Query(model).onId(id);
    if (publish._matches(doc))
      query.update(attrs);
    else
      query.remove();
  }

  function removed(data) {
    var nh = data.toString().split('|');
    var model = Model[nh[0]];
    var id =  nh[1];
    var doc = model.findById(id);
    new Query(model).onId(id).remove();
  }

  function modelUpdate(func) {
    return function (data) {
      var index = data.indexOf('{');
      if (index === -1) {
        env.Error('Unpected message format: '+ data);
        return;
      }
      var nh = data.slice(0,index).toString().split('|');
      func.call(this, Model[nh[0]], nh[1], JSON.parse(data.slice(index).toString()));
    };
  }
});

define(function(require, exports, module) {
  var Model = require('../model/main');
  var session = require('./client-main');
  var Query = require('../model/query');
  var ModelEnv = require('../model/client-main');

  session.provide('A', modelUpdate(added));
  session.provide('C', modelUpdate(changed));
  session.provide('R', modelUpdate(removed));

  function added(model, id, attrs) {
    attrs._id = id;
    ModelEnv.insert(new model(attrs));
  }

  function changed(model, id, attrs) {
    attrs._id = id;
    new Query(model).onId(id).update(attrs);
  }

  function removed(model, id) {
    new Query(model).onId(id).remove();
  }

  function modelUpdate(func) {
    return function (data) {
      var index = data.indexOf('{');
      var nh = (index === -1 ? data : data.slice(0,index)).toString().split('|');
      func.call(this, Model[nh[0]], nh[1], JSON.parse(data.slice(index).toString()));
    };
  }
});

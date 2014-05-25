define(function(require, exports, module) {
  var Model = require('../model/main');
  var session = require('./client-main');
  var Query = require('../model/query');
  var ModelEnv = require('../model/client-main');
  var core = require('koru/core');

  session.provide('A', modelUpdate(added));
  session.provide('C', modelUpdate(changed));
  session.provide('R', removed);

  function added(model, id, attrs) {
    attrs._id = id;
    ModelEnv.insert(new model(attrs));
  }

  function changed(model, id, attrs) {
    attrs._id = id;
    new Query(model).onId(id).update(attrs);
  }

  function removed(data) {
    var nh = data.toString().split('|');
    new Query(Model[nh[0]]).onId(nh[1]).remove();
  }

  function modelUpdate(func) {
    return function (data) {
      var index = data.indexOf('{');
      if (index === -1) {
        core.Error('Unpected message format: '+ data);
        return;
      }
      var nh = data.slice(0,index).toString().split('|');
      func.call(this, Model[nh[0]], nh[1], JSON.parse(data.slice(index).toString()));
    };
  }
});

define(function(require, exports, module) {
  var publish = require('bart/session/publish');
  var List = require('models/list');
  var Query = require('bart/model/query');
  var Todo = require('models/todo');

  publish('all', function () {
    var sub = this;

    var handles = [];

    sub.onStop(function () {
      handles.forEach(function (handle) {
        handle.stop();
      });
    });

    [List, Todo].forEach(function (model) {
      handles.push(model.onChange(sub.sendUpdate.bind(sub)));
      new Query(model).forEach(function (doc) {
        sub.sendUpdate(doc);
      });
    });

    sub.ready();
  });
});

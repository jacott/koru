define(function(require, exports, module) {
  var publish = require('koru/session/publish');
  var List = require('models/list');
  var Query = require('koru/model/query');
  var Todo = require('models/todo');

  publish('all', function () {
    var sub = this;

    if (isClient) {
      sub.match('List', function (doc) {return true});
      sub.match('Todo', function (doc) {return true});

      return;
    }

    if (! sub.userId) {
      sub.setUserId("_guest");
      return;
    }

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
  });
});

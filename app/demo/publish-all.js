define(function(require, exports, module) {
  const Query   = require('koru/model/query');
  const publish = require('koru/session/publish');
  const List    = require('models/list');
  const Todo    = require('models/todo');

  publish({module, init() {
    var sub = this;

    if (isClient) {
      sub.match('List', doc => true);
      sub.match('Todo', doc => true);

      return;
    }

    if (! sub.userId) {
      sub.setUserId("_guest");
      return;
    }

    const handles = [];

    sub.onStop(function () {
      handles.forEach(handle => handle.stop());
    });

    for (let model of [List, Todo]) {
      handles.push(model.onChange(sub.sendUpdate.bind(sub)));
      new Query(model).forEach(doc => sub.sendUpdate(doc));
    }
  }});
});

define(function(require, exports, module) {
  var koru =     require('koru/main');
  var util =    require('koru/util');
  var Query =   require('koru/model/query');
  var Dom =     require('koru/dom');
  var Route =   require('koru/ui/route');
                require('koru/ui/each');

  var $ = Dom.current;

  var List =    require('models/list');
  var Todo =    require('models/todo');
  var ListTpl = require('./lists');
  var okcancel = require('./okcancel');

  koru.onunload(module, onExit);

  var Tpl = Dom.newTemplate(require('koru/html!./item-list'));
  var Tag = Tpl.Row.Tag;

  Tpl.$extend({
    onEntry: function (page, pageRoute) {
      var listId = pageRoute.listId;
      var list = (listId && List.findById(listId)) || new Query(List).fetchOne();

      document.getElementById('items-view').appendChild(Tpl.$autoRender({list: list, filter: null}));

      ListTpl.select(list);

      Dom.getCtxById('tag-filter').updateAllTags({list: list});

      return list && list._id;
    },

    onExit: onExit,
  });

  Route.root.defaultPage = Tpl;
  Route.root.routeVar = "listId";

  Tpl.$helpers({
    todos: function (callback) {
      if (! this.list) return;
      var self = this;
      var listId = self.list._id;
      callback.render({
        model: Todo,
        sort: util.compareByField('timestamp'),
        filter: function (todo) {
          return todo.list_id === listId &&
            (! self.filter || todo.tags.indexOf(self.filter) !== -1);
        },
        changed: function () {
          Dom.getCtxById('tag-filter').updateAllTags();
        },
      });
    },
  });

  Tpl.Row.$helpers({
    tags: function (callback) {
      var frag = document.createDocumentFragment();
      for(var i = 0; i < this.tags.length; ++i) {
        frag.appendChild(Tag.$autoRender({tag: this.tags[i]}));
      }
      return frag;
    },

    done: function () {
      $.element.checked = !! this.done;
    },

    doneClass: function () {
      Dom.setClass('done', this.done);
    },
  });

  Tpl.NewTodo.$events(okcancel('', {
    ok: function (value, event) {
      var ctx = Dom.getCtxById('item-list');
      if (! ctx) return;
      var data = ctx.data;
      if (! data.list) return;

      Todo.create({text: value, list_id: data.list._id, done: false,
                   timestamp: (new Date()).getTime(),
                   tags: data.filter ? [data.filter] : []});
      this.value = "";
    },

    cancel: function (event) {
      this.value = "";
    },
  }));

  Tpl.Row.$events({
    'click .addtag': function (event) {
      Dom.stopEvent();
      Dom.removeId('AddTag');
      var elm = Tpl.Row.AddTag.$autoRender($.ctx.data);
      this.parentNode.insertBefore(elm, this);
      elm.focus();
    },
    'click .destroy': function (event) {
      Dom.stopEvent();
      $.ctx.data.$remove();
    },

    'click .check': function (event) {
      var todo = $.ctx.data;
      todo.done = ! todo.done;
      todo.$$save();
    },

    'click .remove': function (event) {
      Dom.stopEvent();
      var todo = $.ctx.data;
      var remove = $.data(this).tag;
      todo.tags = todo.tags.filter(function (tag) {
        return tag !== remove;
      });
      todo.$$save();
    },
  });

  Tpl.Row.AddTag.$events({
    'change': function (event) {
      Dom.stopEvent();

      var value = this.value;
      Dom.remove(this);
      if (! value) return;
      var todo = $.ctx.data;
      todo.$change('tags').push(value);
      todo.$$save();
    },

    'focusout': function (event) {
      Dom.remove(this);
    },

    'keydown': function (event) {
      if (event.which !== 27) return;
      Dom.stopEvent();
      Dom.remove(this);
    },
  });

  (function () {
    Dom.removeId('new-todo');
    var elm = document.getElementById('new-todo-box');
    elm.insertBefore(Tpl.NewTodo.$autoRender({}), elm.firstChild);
  })();


  function onExit() {
    Dom.removeId('item-list');
  }

  return Tpl;
});

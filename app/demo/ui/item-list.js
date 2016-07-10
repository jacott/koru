define(function(require, exports, module) {
  const Dom      = require('koru/dom');
  const koru     = require('koru/main');
  const Query    = require('koru/model/query');
  require('koru/ui/each');
  const Route    = require('koru/ui/route');
  const util     = require('koru/util');
  const List     = require('models/list');
  const Todo     = require('models/todo');
  const ListTpl  = require('./lists');
  const okcancel = require('./okcancel');

  koru.onunload(module, onExit);

  const Tpl = Dom.newTemplate(require('koru/html!./item-list'));
  const $ = Dom.current;
  const Tag = Tpl.Row.Tag;

  Tpl.$extend({
    onEntry(page, pageRoute) {
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
    todos(callback) {
      if (! this.list) return;
      var self = this;
      var listId = self.list._id;
      callback.render({
        model: Todo,
        sort: util.compareByField('timestamp'),
        filter(todo) {
          return todo.list_id === listId &&
            (! self.filter || todo.tags.indexOf(self.filter) !== -1);
        },
        changed() {
          Dom.getCtxById('tag-filter').updateAllTags();
        },
      });
    },
  });

  Tpl.Row.$helpers({
    tags(callback) {
      var frag = document.createDocumentFragment();
      for(var i = 0; i < this.tags.length; ++i) {
        frag.appendChild(Tag.$autoRender({tag: this.tags[i]}));
      }
      return frag;
    },

    done() {
      $.element.checked = !! this.done;
    },

    doneClass() {
      Dom.setClass('done', this.done);
    },
  });

  Tpl.NewTodo.$events(okcancel('', {
    ok(value, event) {
      var ctx = Dom.getCtxById('item-list');
      if (! ctx) return;
      var data = ctx.data;
      if (! data.list) return;

      Todo.create({text: value, list_id: data.list._id, done: false,
                   timestamp: (new Date()).getTime(),
                   tags: data.filter ? [data.filter] : []});
      this.value = "";
    },

    cancel(event) {
      this.value = "";
    },
  }));

  Tpl.Row.$events({
    'click .addtag'(event) {
      Dom.stopEvent();
      Dom.removeId('AddTag');
      var elm = Tpl.Row.AddTag.$autoRender($.ctx.data);
      this.parentNode.insertBefore(elm, this);
      elm.focus();
    },
    'click .destroy'(event) {
      Dom.stopEvent();
      $.ctx.data.$remove();
    },

    'click .check'(event) {
      var todo = $.ctx.data;
      todo.done = ! todo.done;
      todo.$$save();
    },

    'click .remove'(event) {
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
    'change'(event) {
      Dom.stopEvent();

      var value = this.value;
      Dom.remove(this);
      if (! value) return;
      var todo = $.ctx.data;
      todo.$change('tags').push(value);
      todo.$$save();
    },

    'focusout'(event) {
      Dom.remove(this);
    },

    'keydown'(event) {
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

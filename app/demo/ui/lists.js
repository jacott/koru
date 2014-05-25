define(function(require, exports, module) {
  var List = require('models/list');
  var Dom = require('koru/dom');
  require('koru/ui/each');
  var Route = require('koru/ui/route');
  var okcancel = require('./okcancel');

  var $ = Dom.current;

  var Tpl = Dom.newTemplate(require('koru/html!./lists'));

  Tpl.$helpers({
    lists: function (callback) {
      callback.render({
        model: List,
        sort: "name",
      });
    },
  });

  Tpl.$events({
    'click a.list-name': function (event) {
      Dom.stopEvent();
      Route.gotoPath(this.getAttribute('href'));
    },
  });

  Tpl.Row.$helpers({
    listId: function () {
      return "List_"+ this._id;
    },
  });

  Tpl.Row.Display.$helpers({
    href: function () {
      return "/"+this._id;
    },
  });

  Tpl.$extend({
    select: function (list) {
      Dom.removeClass(document.querySelector('.list.selected'), 'selected');
      list && Dom.addClass(document.getElementById('List_' + list._id), 'selected');
    },
  });

  Tpl.NewList.$events(okcancel('', {
    ok: function (value, event) {
      List.create({name: value});
      this.value = "";
    },

    cancel: function (event) {
      this.value = "";
    },
  }));

  Dom.removeId('new-list');
  document.getElementById('createList').appendChild(Tpl.NewList.$autoRender({}));

  return Tpl;
});

define(function(require, exports, module) {
  var Dom = require('../dom');
  var Form = require('./form');
  var util = require('../util');
  var Dialog = require('./dialog');
  var Route = require('./route');

  var Tpl = Dom.newTemplate(require('../html!./page-link'));
  var $ = Dom.current;

  var IGNORE = {append: true, search: true, value: true, link: true, template: true};

  Tpl.$helpers({
    content: function () {
      if ('value' in this) return this.value;
      return this.link && this.link.title;
    },

    attrs: function () {
      var elm = $.element;
      var data = $.ctx.data;

      var template = data.template;
      if (template) {
        data.link = Dom.lookupTemplate(data.template);
      }

      for(var attr in data) {
        if ((attr in IGNORE) || /^var_/.test(attr)) continue;
        elm.setAttribute(attr, data[attr]);
      }

      Dom.addClass(elm, 'link');
    },
  });

  Tpl.$events({
    'click': function (event) {
      Dom.stopEvent();
      var data = $.data();

      var location = {};

      for (var attr in data) {
        if (/^var_/.test(attr)) location[attr.slice(4)] = data[attr];
      }

      if (data.append) location.append = data.append;
      if (data.search) location.search = '?' + data.search;

      Route.gotoPath(data.link, location);
    },
  });

  Dom.registerHelpers({
    pageLink: Dom.Form.pageLink = function (options) {
      return Tpl.$autoRender(options);
    },
  });
});

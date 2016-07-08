define(function(require, exports, module) {
  const Dom    = require('../dom');
  const util   = require('../util');
  const Dialog = require('./dialog');
  const Form   = require('./form');
  const Route  = require('./route');

  const Tpl = Dom.newTemplate(require('../html!./page-link'));
  const $ = Dom.current;

  const IGNORE = {append: true, search: true, value: true,
                  class: true, link: true, template: true};

  Tpl.$helpers({
    content() {
      if ('value' in this) return this.value;
      return this.link && this.link.title;
    },

    attrs() {
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

      elm.className = data.class || 'link';
    },
  });

  Tpl.$events({
    'click'(event) {
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

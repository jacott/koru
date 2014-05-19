var $ = Bart.current;
var Tpl = Bart.Form.PageLink;
var IGNORE = {append: true, search: true, value: true, link: true, template: true};

Tpl.$helpers({
  attrs: function () {
    var elm = $.element;
    var data = $.ctx.data;

    var template = data.template;
    if (template) {
      data.link = Bart.lookupTemplate(data.template);
    }

    for(var attr in data) {
      if (! (attr in IGNORE))
        elm.setAttribute(attr, data[attr]);
    }

    Bart.addClass(elm, 'link');
  },
});

Tpl.$events({
  'click': function (event) {
    Bart.stopEvent();
    var data = $.data();

    var location = {};

    if (data.append) location.append = data.append;
    if (data.search) location.search = '?' + data.search;
    AppRoute.gotoPath(data.link, location);
  },
});

Bart.registerHelpers({
  pageLink: Bart.Form.pageLink = function (options) {
    return Tpl.$autoRender(options);
  },
});

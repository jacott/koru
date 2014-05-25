define(function(require, exports, module) {
  var Dom = require('koru/dom');
  var route = require('koru/ui/route');
  var Lists = require('./lists');
  var TagFilter = require('./tag-filter');
  require('./item-list');

  return {
    start: function () {
      // we may be reloading so remove old elements
      Dom.removeId('tag-filter');
      Dom.removeId('lists');

      document.getElementById('top-tag-filter').appendChild(TagFilter.$autoRender({}));
      document.getElementById('side-pane').insertBefore(Lists.$autoRender({}), document.getElementById('createList'));

      route.replacePath(window.location);
    },
  };
});

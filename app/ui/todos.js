define(function(require, exports, module) {
  var Dom = require('bart/dom');
  var route = require('bart/ui/route');
  var Lists = require('./lists');
  var TagFilter = require('./tag-filter');

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

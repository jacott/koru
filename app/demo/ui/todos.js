define(function(require, exports, module) {
  var koru = require('koru');
  var Route = require('koru/ui/route');
  var subscribe = require('koru/session/subscribe');
  var Dom = require('koru/dom');
  var session = require('koru/session');
  var publishAll = require('publish-all');

  var Lists = require('./lists');
  var TagFilter = require('./tag-filter');
  require('./item-list');

         // reload me if unloaded
  koru.onunload(module, function () {
    subHandle && subHandle.stop();
    subHandle = null;
    require([module.id], function () {});
  });

  session.connect();

  subscribe = subscribe(session);

  Route.title = 'Todos';

  window.addEventListener('popstate', function (event) {
    Route.pageChanged();
  });

  var subHandle = subscribe('all', function () {
    Dom.removeClass(document.body, 'loading');

    // we may be reloading so remove old elements
    Dom.removeId('tag-filter');
    Dom.removeId('lists');

    document.getElementById('top-tag-filter').appendChild(TagFilter.$autoRender({}));
    document.getElementById('side-pane').insertBefore(Lists.$autoRender({}), document.getElementById('createList'));

    Route.replacePath(window.location);
  });
});

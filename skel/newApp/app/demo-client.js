define(function(require, exports, module) {
  const session   = require('koru/session');
  const cssLoader = new require('koru/css/loader')(session);

  cssLoader.loadAll('ui');
  // var Trace = require('koru/trace');

  // Trace.debug_page(true);
  // Trace.debug_subscribe(true);
  // Trace.debug_clientUpdate({User: true, Org: true, Invite: true});
});

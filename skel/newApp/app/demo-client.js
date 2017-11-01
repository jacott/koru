define(function(require, exports, module) {
  const cssLoader = new (require('koru/css/loader'))(session);
  const session         = require('koru/session');

  cssLoader.loadAll('ui');
  // const Trace = require('koru/trace');

  // Trace.debug_page(true);
  // Trace.debug_subscribe(true);
  // Trace.debug_clientUpdate({User: true, Org: true, Invite: true});
});

define((require, exports, module) => {
  'use strict';
  const session         = require('koru/session');

  const cssLoader = new (require('koru/css/loader'))(session);

  cssLoader.loadAll('ui');
  // const Trace = require('koru/trace');

  // Trace.debug_page(true);
  // Trace.debug_subscribe(true);
  // Trace.debug_clientUpdate({User: true, Org: true, Invite: true});
});

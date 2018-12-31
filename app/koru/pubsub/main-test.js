define((require, exports, module)=>{
  /**
   * The publish subscribe systems allows clients to be informed of changes on the server.  The
   * usual scenario is when a client is interested in one or more {#koru/model/main}s.
   *

   * To get reactive changes to server models. A client subscribes to a publication either using
   * the simplistic {#../all-pub} and {#../all-sub} classes or custom classes
   * like the following:
   *
   * |Client|Server|
   * |------|------|
   * |{{example:client-subscription:0}}|{{example:server-publish:0}}|
   * |{{example:client-subscription:1}}|                            |
   * |                                 |{{example:server-publish:1}}|
   * |{{example:client-subscription:2}}|                            |
   * |                                 |{{example:server-publish:2}}|
   * |{{example:client-subscription:3}}|                            |
   * |                                 |{{example:server-publish:3}}|
   *
   * The example above is deficient in several ways:
   *
   * 1. It does not send updated related only to the shelf requested

   * 1. It does not coordinate with other publications which may be publishing the same documents.

   * 1. It does not use `lastSubscribed` to reduce server-to-client traffic.

   *
   * It is non-trivial to fix these deficiencies but looking at the {#../all-pub} source code
   * illustrates how to use `lastSubscribed`.
   **/
  const TH = require('koru/test-helper');

  require('koru/env!./main-test')({TH, module});
});

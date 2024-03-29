define((require, exports, module) => {
  'use strict';

  class MockServer {
    constructor(session) {
      this.session = session;
    }
    sendSubResponse(args) {
      return this.session._commands.Q.call(this.session, args);
    }
  }

  return MockServer;
});

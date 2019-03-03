define((require, exports, module)=>{

  class MockServer {
    constructor(session) {
      this.session = session;
    }
    sendSubResponse(args) {
      this.session._commands.Q.call(this.session, args);
    }
  }

  return MockServer;

});

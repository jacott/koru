define(function(require, exports, module) {
  const ClientSub = require('koru/session/client-sub');
  const publish   = require('koru/session/publish');
  const TH        = require('koru/test/main');
  const util      = require('koru/util');

  const {stub, spy, onEnd} = TH;

  class MockClientSub extends ClientSub {
    constructor(name, args) {
      super({}, 's123', name, args);
      this._mockMatches = new Map;
    }

    onStop (func) {
      TH.test.onEnd(func);
    }

    match(model, func) {
      if (this._mockMatches.get(model))
        throw new Error(model.modelName + " is already matching for subscription " + this.name);

      this._mockMatches.set(model, func);
    }

    $inspect() {return `{MockSub:"${this.name}"}`;}
  }

  const publishTH = {
    mockSubscribe(name, ...args) {
      const sub = new MockClientSub(name, args);
      spy(sub, 'onStop');
      const pub = publish._pubs[name];
      pub.apply(sub, args);
      return sub;
    },
  };

  module.exports = publishTH;
});

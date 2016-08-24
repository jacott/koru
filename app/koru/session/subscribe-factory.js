define(function(require, exports, module) {
  const koru      = require('koru/main');
  const ClientSub = require('koru/session/client-sub');
  const login     = require('koru/user-account/client-login');
  const util      = require('koru/util');
  const message   = require('./message');
  const publish   = require('./publish');

  koru.onunload(module, 'reload');

  function subscribeFactory(session) {
    let nextId = 0;
    const subs = session.subs = Object.create(null);

    session.sendP = function (...args) {
      session.state.isReady() && session.sendBinary('P', args);
    };

    session._commands.P || session.provide('P', function (data) {
      var handle = this.subs[data[0]];
      if (! handle) return;
      handle._received(data[1] && data.slice(1));
    });

    var userId;

    let loginOb = login.onChange(session, function (state, sess) {
      if (state === 'change') {
        if (koru.userId() === userId) return;
        userId = koru.userId();
        var models = {};
        for(var key in subs) {
          subs[key].resubscribe(models);
        }
        publish._filterModels(models);
      }
    });

    session.state.onConnect('10-subscribe', subcribe._onConnect = function (session) {
      for(var id in subs) {
        var sub = subs[id];
        sub._wait();
        session.sendP(id, sub.name, sub.args);
      }
    });

    function subcribe(name, ...args) {
      if (! publish._pubs[name]) throw new Error("No client publish of " + name);

      const callback = args[args.length - 1];
      const sub = new ClientSub(session, (++nextId).toString(36), name, args);
      if (session.interceptSubscribe && session.interceptSubscribe(name, sub, callback))
        return sub;
      subs[sub._id] = sub;
      sub._wait();
      session.sendP(sub._id, name, sub.args);
      sub.resubscribe();
      return sub;
    };

    util.extend(subcribe, {
      unload() {
        session.state.stopOnConnect('10-subscribe');
        loginOb && loginOb.stop();
        loginOb = null;
        session.unprovide('P');
        session.sendP = null;
        clientUpdate && clientUpdate.unload();
        clientUpdate = null;
        userId = null;
      },
      set _userId(value) {userId = value},
      // test methods

      get _subs() {return subs},
      get _nextId() {return nextId},
    });

    var clientUpdate = require('./client-update')(session);

    return subcribe;
  };

  module.exports = subscribeFactory;
});

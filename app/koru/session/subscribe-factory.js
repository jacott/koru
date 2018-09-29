define((require, exports, module)=>{
  const koru            = require('koru/main');
  const ClientSub       = require('koru/session/client-sub');
  const login           = require('koru/user-account/client-login');
  const util            = require('koru/util');
  const message         = require('./message');
  const publish         = require('./publish');

  const {private$} = require('koru/symbols');

  koru.onunload(module, 'reload');

  return function subscribeFactory(session) {
    let nextId = 0;
    const subs = session.subs = Object.create(null);

    session.sendP = (...args) => {
      session.state.isReady() && session.sendBinary('P', args);
    };

    session._commands.P === undefined && session.provide('P', function (data) {
      const sub = this.subs[data[0]];
      if (sub === undefined) return;
      sub._received(data[1], data[2]);
    });

    let userId = null, loginOb = null;

    const subcribe = (name, ...args)=>{
      if (! publish._pubs[name]) throw new Error("No client publish of " + name);

      loginOb === null && observeLogin();

      const sub = new ClientSub(session, (++nextId).toString(36), name, args);
      if (session.interceptSubscribe && session.interceptSubscribe(name, sub))
        return sub;
      sub._wait();
      const ready = err => {
        if (! sub._id) return; // too late
        if (err) {
          sub._received(err);
          return;
        }
        subs[sub._id] = sub;
        ClientSub[private$].subscribe(sub);
        session.sendP(sub._id, name, sub.args, sub.lastSubscribed);
      };
      const preload = sub._subscribe && sub._subscribe.preload;
      const promise = preload && preload(sub);
      if (promise && promise.then)
        promise.then(() => {ready()}, err => {ready(err)});
      else
        ready();

      return sub;
    };

    session.state.onConnect('10-subscribe', subcribe._onConnect = session => {
      for(const id in subs) {
        const sub = subs[id];
        sub._wait();
        session.sendP(id, sub.name, sub.args, sub.lastSubscribed);
      }
    });

    const observeLogin = () => {
      userId = koru.userId();
      loginOb = login.onChange(session, (state, sess) => {
        if (state === 'change') {
          if (koru.userId() === userId) return;
          userId = koru.userId();
          const models = {};
          for(const key in subs) {
            ClientSub[private$].resubscribe(subs[key], models);
          }
          publish._filterModels(models);
        }
      });
    };

    util.merge(subcribe, {
      unload() {
        session.state.stopOnConnect('10-subscribe');
        loginOb !== null && loginOb.stop();
        session.unprovide('P');
        session.sendP = null;
        clientUpdate.unload();
        userId = loginOb = null;
      },
      set _userId(value) {userId = value},
      // test methods

      get _subs() {return subs},
      get _nextId() {return nextId},
    });

    const clientUpdate = require('./client-update')(session);

    return subcribe;
  };
});

define((require)=>{
  const koru            = require('koru');
  const Model           = require('koru/model');
  const dbBroker        = require('koru/model/db-broker');
  const DocChange       = require('koru/model/doc-change');
  const ModelMap        = require('koru/model/map');
  const Query           = require('koru/model/query');
  const TransQueue      = require('koru/model/trans-queue');
  const Match           = require('koru/session/match');
  const Trace           = require('koru/trace');
  const login           = require('koru/user-account/client-login');
  const util            = require('koru/util');

  const loginObserver$ = Symbol(), messages$ = Symbol(), reconnect$ = Symbol(), msgId$ = Symbol();

  const sessions = Object.create(null);

  const match = new Match();

  const assertState = (truth)=>{
    if (! truth) throw new Error("Illegal action");
  };

  function provideQ(data) {
    const subSess = sessions[this._id];
    if (subSess === void 0) return;
    const sub = subSess.subs[data[0]];
    if (sub === void 0) return;
    const status = data[2];
    try {
      if (status !== 200) {
        if (status <=0) {
          const callback = sub[messages$][data[1]];
          if (callback === void 0) return;
          if (status == 0) {
            callback(null, data[3]);
          } else {
            callback(new koru.Error(-status, data[3]));
          }
        } else {
          sub.stop({code: data[2], reason: data[3]});
        }
      } else
        sub._connected({lastSubscribed: data[3]});
    } finally {
      if (sub[msgId$] === data[1]) {
        sub[msgId$] = void 0;
        sub[messages$].length = 0;
        subSess.session.state.decPending();
      }
    }
  }

  const sendInit = (ss, sub)=>{
    if (sub[reconnect$]) {
      sub.reconnecting();
    } else {
      sub[reconnect$] = true;
    }
    ss.session.sendBinary('Q', [
      sub._id, sub[msgId$], sub.constructor.pubName, sub.args, sub.lastSubscribed]);
  };

  const incPending = (ss, sub)=>{
    if (sub[msgId$] === void 0) {
      sub[msgId$] = 1;
      ss.session.state.incPending();
    } else ++sub[msgId$];
  };

  let debug_clientUpdate = false;
  Trace.debug_clientUpdate = value => {debug_clientUpdate = value};

  const modelUpdate = (type, func) => {
    return function (data) {
      const session = this;
      if (debug_clientUpdate) {
        if (debug_clientUpdate === true || debug_clientUpdate[data[0]])
          koru.logger("D", type, '< ' + util.inspect(data));
      }
      session.isUpdateFromServer = true;
      const prevDbId = dbBroker.dbId;
      try {
        dbBroker.dbId = session._id;
        func(Model[data[0]], data[1], data[2]);
      } finally {
        session.isUpdateFromServer = false;
        dbBroker.dbId = prevDbId;
      }
    };
  };

  // FIXME match updates
  // for change:
  //   if did match and now does not match reason = "noMatch"
  //   if did not match reason = "stopped"
  // and maybe the server sends the reason for remove?

  // need to queue changes and remove until subs have completed
  const added = modelUpdate('Add', (model, attrs) => {
    Query.insertFromServer(model, attrs);
  });

  const changed = modelUpdate('Upd', (model, id, attrs) => {
    model.serverQuery.onId(id).update(attrs);
  });

  const removed = modelUpdate('Rem', (model, id) => {
    model.serverQuery.onId(id).remove();
  });

  class SubscriptionSession {
    constructor(session) {
      this.nextId = 0;
      this.subs = util.createDictionary();
      this.session = session;

      session.provide('Q', provideQ);
      session.provide('A', added);
      session.provide('C', changed);
      session.provide('R', removed);

      this.userId = koru.userId();
      this[loginObserver$] = login.onChange(session, (state)=>{
        if (state === 'change') {
          if (koru.userId() === this.userId) return;
          const oldUid = this.userId;
          this.userId = koru.userId();
          const {subs} = this;
          for(const key in subs) {
            subs[key].userIdChanged(this.userId, oldUid);
          }
        }
      });

      session.state.onConnect('10-subscribe2', ()=>{
        for(const id in this.subs) {
          const sub = this.subs[id];
          if (sub[msgId$] === void 0)
            incPending(this, sub);
          else
            sub[msgId$] = 1;
          sub[messages$].length = 0;
          sendInit(this, this.subs[id]);
        }
      });
    }

    connect(sub) {
      if (this.subs[sub._id] !== void 0)
        throw new Error("Illegal connect on active subscription");
      this.subs[sub._id] = sub;
      sub[reconnect$] = false;
      sub[messages$] = [];
      incPending(this, sub);

      this.session.state.isReady() &&
        sendInit(this, sub);
    }

    postMessage(sub, message, callback) {
      if (! this.session.state.isReady()) return;
      incPending(this, sub);
      if (callback !== void 0)
        sub[messages$][sub[msgId$]] = callback;

      this.session.sendBinary('Q', [sub._id, sub[msgId$], null, message]);
    }

    _delete(sub) {
      assertState(sub.state === 'stopped');
      delete this.subs[sub._id];
      if (sub[msgId$] !== void 0) {
        sub[msgId$] = void 0;
        this.session.state.decPending();
      }
    }

    makeId() {return (++this.nextId).toString(36)}

    static get(session) {
      return sessions[session._id] || (sessions[session._id] = new SubscriptionSession(session));
    }

    static get match() {return match}

    static unload({_id}) {
      const ss = sessions[_id];
      if (ss === void 0) return;
      const {session} = ss;
      session.state.stopOnConnect('10-subscribe2');
      session.unprovide('Q');
      session.unprovide('A');
      session.unprovide('C');
      session.unprovide('R');
      ss[loginObserver$] !== null && ss[loginObserver$].stop();
      ss.userId = ss.loginOb = null;

      for (const msgId in ss.subs) ss.subs[msgId].stop();

      delete sessions[_id];
    }

    static _filterModels(models, reason="noMatch") {
      TransQueue.transaction(() => {
        for(const name in models) {
          const model = ModelMap[name];
          if (model !== void 0) {
            const {docs} = model;
            for (const id in docs) filterDoc(docs[id], reason);
          }
        }
      });
    }

    static _filterStopped(doc) {filterDoc(doc, 'stopped')}

    static get _sessions() {
      return sessions;
    }
  }

  const filterDoc = SubscriptionSession.filterDoc = (doc, reason) => {
    if (! match.has(doc, reason)) {
      const model = doc.constructor;
      const simDocs = Query.simDocsFor(model);
      const sim = simDocs[doc._id];
      if (sim !== void 0)
        delete simDocs[doc._id];
      delete model.docs[doc._id];
      Query.notify(DocChange.delete(doc, reason));
    }
  };

  return SubscriptionSession;
});

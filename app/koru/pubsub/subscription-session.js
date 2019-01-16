define((require)=>{
  const koru            = require('koru');
  const ClientUpdate    = require('koru/session/client-update');
  const login           = require('koru/user-account/client-login');
  const util            = require('koru/util');
  const DocChange       = require('koru/model/doc-change');
  const ModelMap        = require('koru/model/map');
  const Query           = require('koru/model/query');
  const TransQueue      = require('koru/model/trans-queue');
  const Match           = require('koru/session/match');

  const loginObserver$ = Symbol(), messages$ = Symbol(), reconnect$ = Symbol(), msgId$ = Symbol();

  const sessions = Object.create(null);

  const match = new Match();

  const assertState = (truth)=>{
    if (! truth) throw new Error("Illegal action");
  };

  function provideP(data) {
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

  class SubscriptionSession {
    constructor(session) {
      this.nextId = 0;
      this.subs = util.createDictionary();
      this.session = session;

      session._commands.Q === void 0 && session.provide('Q', provideP);

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
          sub[msgId$] === void 0 && incPending(this, sub);
          sub[msgId$] = 1;
          sub[messages$].length = 0;
          sendInit(this, this.subs[id]);
        }
      });

      this.clientUpdate = ClientUpdate(session);
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

    set _userId(value) {this.userId = value}

    makeId() {return (++this.nextId).toString(36)}

    static get(session) {
      return sessions[session._id] || (sessions[session._id] = new SubscriptionSession(session));
    }

    static get match() {return match}

    static unload(session) {
      const ss = sessions[session._id];
      if (ss === void 0) return;
      ss.session.state.stopOnConnect('10-subscribe2');
      ss[loginObserver$] !== null && ss[loginObserver$].stop();
      ss.session.unprovide('Q');
      ss.clientUpdate.unload();
      ss.userId = ss.loginOb = null;

      delete sessions[session._id];
    }

    static _filterModels(models, reason="noMatch") {
      TransQueue.transaction(() => {
        for(const name in models) {
          const _mm = match._models;
          if (_mm === void 0) continue;
          const mm = _mm[name];
          if (mm === void 0) continue;
          const model = ModelMap[name];
          if (model === void 0) continue;
          const docs = model.docs;
          for (const id in docs) {
            const doc = docs[id];
            let remove = true;
            for(const compare of mm) {
              if (compare(doc, reason)) {
                remove = false;
                break;
              }
            }
            if (remove) {
              const simDocs = Query.simDocsFor(model);
              const sim = simDocs[doc._id];
              if (sim !== void 0)
                delete simDocs[doc._id];
              delete docs[id];
              Query.notify(DocChange.delete(doc, reason));
            }
          }
        }
      });
    }

    static _filterStopped(doc) {
      if (! match.has(doc, 'stopped')) {
        const model = doc.constructor;
        const simDocs = Query.simDocsFor(model);
        const sim = simDocs[doc._id];
        if (sim !== void 0)
          delete simDocs[doc._id];
        delete model.docs[doc._id];
        Query.notify(DocChange.delete(doc, 'stopped'));
      }
    }

    static get _sessions() {
      return sessions;
    }
  }

  return SubscriptionSession;
});

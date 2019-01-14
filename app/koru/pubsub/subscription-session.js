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

  const loginObserver$ = Symbol(), reconnect$ = Symbol(), msgId$ = Symbol();

  const sessions = Object.create(null);

  const match = new Match();

  const assertState = (truth)=>{
    if (! truth) throw new Error("Illegal action");
  };

  function provideP(data) {
    const subSess = sessions[this._id];
    if (subSess === undefined) return;
    const sub = subSess.subs[data[0]];
    if (sub === undefined) return;
    if (sub[msgId$] !== data[1]) return;
    sub[msgId$] = undefined;
    try {
      if (data[2] !== 200)
        sub.stop({code: data[2], reason: data[3]});
      else
        sub._connected({lastSubscribed: data[3]});
    } finally {
      subSess.session.state.decPending();
    }
  }

  const sendInit = (ss, sub)=>{
    if (sub[reconnect$] === void 0) {
      sub[reconnect$] = true;
    } else {
      sub.reconnecting();
    }
    ss.session.sendBinary('Q', [sub._id, sub[msgId$], sub.constructor.pubName, sub.args, sub.lastSubscribed]);
  };

  const incPending = (ss, sub)=>{
    if (sub[msgId$] === undefined) {
      sub[msgId$] = 1;
      ss.session.state.incPending();
    } else ++sub[msgId$];
  };

  class SubscriptionSession {
    constructor(session) {
      this.nextId = 0;
      this.subs = util.createDictionary();
      this.session = session;

      session._commands.Q === undefined && session.provide('Q', provideP);

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
          sendInit(this, this.subs[id]);
        }
      });

      this.clientUpdate = ClientUpdate(session);
    }

    connect(sub) {
      this.subs[sub._id] = sub;
      incPending(this, sub);

      this.session.state.isReady() &&
        sendInit(this, sub);
    }

    _delete(sub) {
      assertState(sub.state === 'stopped');
      delete this.subs[sub._id];
      if (sub[msgId$] !== undefined) {
        sub[msgId$] = undefined;
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
      if (ss === undefined) return;
      ss.session.state.stopOnConnect('10-subscribe2');
      ss[loginObserver$] !== null && ss[loginObserver$].stop();
      ss.session.unprovide('Q');
      ss.clientUpdate.unload();
      ss.userId = ss.loginOb = null;

      delete sessions[ss.session._id];
    }

    static _filterModels(models, reason="noMatch") {
      TransQueue.transaction(() => {
        for(const name in models) {
          const _mm = match._models;
          if (_mm === undefined) continue;
          const mm = _mm[name];
          if (mm === undefined) continue;
          const model = ModelMap[name];
          if (model === undefined) continue;
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
              if (sim !== undefined)
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
        if (sim !== undefined)
          delete simDocs[doc._id];
        delete model.docs[doc._id];
        Query.notify(DocChange.delete(doc, 'stopped'));
      }
    }
  }

  return SubscriptionSession;
});

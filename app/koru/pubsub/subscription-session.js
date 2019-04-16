define((require)=>{
  'use strict';
  const koru            = require('koru');
  const Model           = require('koru/model');
  const dbBroker        = require('koru/model/db-broker');
  const DocChange       = require('koru/model/doc-change');
  const ModelMap        = require('koru/model/map');
  const Query           = require('koru/model/query');
  const TransQueue      = require('koru/model/trans-queue');
  const Match           = require('koru/pubsub/model-match');
  const Trace           = require('koru/trace');
  const login           = require('koru/user-account/client-login');
  const util            = require('koru/util');

  const {private$} = require('koru/symbols');

  const loginObserver$ = Symbol(),
        connected$ = Symbol(), messageResponse$ = Symbol(),
        reconnect$ = Symbol(), msgId$ = Symbol();

  const sessions = Object.create(null);

  const assertState = (truth)=>{
    if (! truth) throw new Error("Illegal action");
  };

  const incPending = (ss, sub)=>{
    if (sub[msgId$] === void 0) {
      sub[msgId$] = 1;
      ss.session.state.incPending();
    } else ++sub[msgId$];
  };

  const decPending = (ss, sub)=>{
    sub[msgId$] = void 0;
    ss.session.state.decPending();
  };

  function provideQ(data) {
    const subSess = sessions[this._id];
    if (subSess === void 0) return;
    const sub = subSess.subs[data[0]];
    if (sub === void 0) return;
    const msgId = data[1];

    if (msgId == 0) {
      sub.onMessage(data[2]);
      return;
    }
    const status = data[2];
    try {
      if (status !== 200) {
        if (status <=0) {
          sub[messageResponse$](data);
        } else {
          sub.stop(new koru.Error(status, data[3]));
        }
      } else
        sub[connected$]({lastSubscribed: data[3]});
    } finally {
      if (sub[msgId$] === msgId) {
        decPending(subSess, sub);
      }
    }
  }

  const sendInit = (ss, sub)=>{
    if (sub[reconnect$]) {
      sub.reconnecting();
      if (sub.state === 'stopped') return;
    } else {
      sub[reconnect$] = true;
    }
    ss.session.sendBinary('Q', [
      sub._id, sub[msgId$], sub.constructor.pubName, sub.args, sub.lastSubscribed]);
  };

  let debug_clientUpdate = false;
  Trace.debug_clientUpdate = value => {debug_clientUpdate = value};

  const modelUpdate = (type, func) => {
    return function (data) {
      const ss = sessions[this._id];
      if (ss === void 0) return;
      if (debug_clientUpdate) {
        if (debug_clientUpdate === true || debug_clientUpdate[data[0]])
          koru.logger("D", type, '< ' + util.inspect(data));
      }
      this.isUpdateFromServer = true;
      const prevDbId = dbBroker.dbId;
      try {
        dbBroker.dbId = this._id;
        func(ss, Model[data[0]], data[1], data[2]);
      } finally {
        this.isUpdateFromServer = false;
        dbBroker.dbId = prevDbId;
      }
    };
  };

  const added = modelUpdate('Add', (ss, model, attrs) => {
    if (ss.match.has(new model(attrs)))
      Query.insertFromServer(model, attrs);
  });

  const changed = modelUpdate('Upd', (ss, model, id, changes) => {
    const doc = model.findById(id);
    if (doc === void 0) return;
    const nowDoc = doc.$withChanges(changes);
    const ansNow = ss.match.has(nowDoc);
    if (ansNow) {
      model.serverQuery.onId(id).update(changes);
    } else {
      model.query.fromServer(ansNow === false ? 'fromServer' : 'stopped').onId(id).remove();
    }
  });

  const removed = modelUpdate('Rem', (ss, model, id, flag) => {
    model.query.fromServer(flag).onId(id).remove();
  });

  class SubscriptionSession {
    constructor(session) {
      this.nextId = 0;
      this.subs = util.createDictionary();
      this.session = session;
      this.match = new Match();

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
          sendInit(this, this.subs[id]);
        }
      });
    }

    connect(sub) {
      if (this.subs[sub._id] !== void 0)
        throw new Error("Illegal connect on active subscription");
      this.subs[sub._id] = sub;
      sub[reconnect$] = false;
      incPending(this, sub);

      this.session.state.isReady() &&
        sendInit(this, sub);
    }

    postMessage(sub, message) {
      if (this.session.state.isReady() && this.subs[sub._id] !== void 0) {
        incPending(this, sub);

        this.session.sendBinary('Q', [sub._id, sub[msgId$], null, message]);
        return sub[msgId$];
      } else {
        return -1;
      }
    }

    _delete(sub) {
      assertState(sub.state === 'stopped');
      if (this.subs[sub._id] !== void 0) {
        if (this.session.state.isReady())
          this.session.sendBinary('Q', [sub._id]); // stop
        delete this.subs[sub._id];
        if (sub[msgId$] !== void 0) {
          decPending(this, sub);
        }
      }
    }

    makeId() {return (++this.nextId).toString(36)}

    static get(session) {
      return sessions[session._id] || (sessions[session._id] = new SubscriptionSession(session));
    }

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

    static unloadAll() {
      for (const id in sessions)
        this.unload(sessions[id]);
    }

    filterDoc(doc) {
      const ans = doc === void 0 || this.match.has(doc);
      if (! ans) {
        const model = doc.constructor;
        const simDocs = Query.simDocsFor(model);
        const sim = simDocs[doc._id];
        if (sim !== void 0)
          delete simDocs[doc._id];
        delete model.docs[doc._id];
        Query.notify(DocChange.delete(doc, ans === false ? 'fromServer' : 'stopped'));
        return true;
      }
      return false;
    };

    filterModels(models) {
      TransQueue.transaction(() => {
        for(const name of models) {
          const model = ModelMap[name];
          if (model !== void 0) {
            const {docs} = model;
            for (const id in docs) this.filterDoc(docs[id]);
          }
        }
      });
    }

    static get _sessions() {
      return sessions;
    }
  }
  SubscriptionSession[private$] = {
    messageResponse$, connected$,
  };

  return SubscriptionSession;
});

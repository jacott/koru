define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const TransQueue      = require('koru/model/trans-queue');
  const Session         = require('koru/session');
  const util            = require('koru/util');

  const {inspect$} = require('koru/symbols');

  const pubName$ = Symbol(),
        stopped$ = Symbol(), module$ = Symbol();

  const _pubs = Object.create(null);

  const deletePublication = (name) => {
    delete _pubs[name];
  };

  const stopped = (sub) => {
    sub[stopped$] = true;
    if (sub.conn._subs !== null) delete sub.conn._subs[sub.id];
  };

  class Publication {
    constructor({id, conn, lastSubscribed}) {
      this.conn = conn;
      this.id = id;
      this.lastSubscribed = +lastSubscribed || 0;
      if (this.lastSubscribed != 0 &&
          util.dateNow() - this.constructor.lastSubscribedMaximumAge > this.lastSubscribed) {
        throw new koru.Error(400, {lastSubscribed: 'too_old'});
      }
      this[stopped$] = false;
    }

    init(args) {}                    // override me
    onMessage(message) {}            // override me
    userIdChanged(newUID, oldUID) {} // override me

    postMessage(message) {
      this.conn.sendBinary('Q', [this.id, 0, message]);
    }

    stop() {
      if (this[stopped$]) return;
      stopped(this);
      this.conn.sendBinary('Q', [this.id]);
    }

    get isStopped() {return this[stopped$]}

    get userId() {return this.conn.userId}
    set userId(v) {throw new Error('use setUserId')}
    setUserId(v) {return this.conn.setUserId(v)}

    static discreteLastSubscribed(time) {
      const {lastSubscribedInterval} = this;
      return Math.floor(time / lastSubscribedInterval) * lastSubscribedInterval;
    }

    static get pubName() {return this[pubName$]}
    static set pubName(v) {
      if (Session._commands.Q !== onSubscribe) {
        Session.provide('Q', onSubscribe);
      }

      if (this[pubName$] !== void 0) {
        delete _pubs[this[pubName$]];
      }

      Session.addToDict(v);
      this[pubName$] = v;
      if (v !== void 0) _pubs[v] = this;
    }

    static set module(module) {
      this[module$] = module;
      const name = this.pubName = util.moduleName(module).replace(/Pub(?:lication)?$/, '');
      module.onUnload(() => {deletePublication(name)});
    }

    static get module() {return this[module$]}

    [inspect$]() {return `${this.constructor.pubName}Pub("${this.id}")`}
  }

  Publication.lastSubscribedInterval = 5*60*1000;
  Publication.lastSubscribedMaximumAge = 180 * util.DAY;

  Publication.delete = deletePublication;

  async function onSubscribe([id, msgId, name, args, lastSubscribed]) {
    util.thread.action = 'subscribe ' + name;
    const subs = this._subs;
    if (subs == null) return; // we are closed

    if (name === void 0) {
      const sub = subs[id];
      if (sub !== void 0) {
        stopped(sub);
        sub.stop();
      }
      return;
    }

    if (name === null) {
      const sub = subs[id];
      if (sub === void 0) return;
      try {
        this.sendBinary('Q', [id, msgId, 0, await TransQueue.transaction(() => sub.onMessage(args))]);
      } catch (ex) {
        if (ex.error === void 0) {
          koru.unhandledException(ex);
          this.sendBinary('Q', [id, msgId, 500, ex.toString()]);
        } else {
          this.sendBinary('Q', [id, msgId, - ex.error, ex.reason]);
        }
      }
      return;
    }

    const Sub = _pubs[name];
    if (Sub === void 0) {
      const msg = 'unknown publication: ' + name;
      this.sendBinary('Q', [id, msgId, 500, msg]);
      koru.info(msg);
    } else {
      let sub;
      try {
        let subStartTime;
        await TransQueue.transaction(() => {
          subStartTime = util.dateNow();
          sub = subs[id] || (subs[id] = new Sub({id, conn: this, lastSubscribed}));
          return sub.init(args);
        });
        subs[id] !== void 0 && this.sendBinary('Q', [
          id, msgId, 200, sub.lastSubscribed = subStartTime]); // ready

      } catch (ex) {
        if (ex.error === void 0) {
          koru.unhandledException(ex);
          this.sendBinary('Q', [id, msgId, 500, ex.toString()]);
        } else {
          this.sendBinary('Q', [id, msgId, ex.error, ex.reason]);
        }
        if (sub !== void 0) {
          stopped(sub);
          sub.stop();
        }
      }
    }
  }

  return Publication;
});

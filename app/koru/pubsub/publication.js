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

      if (this[pubName$] !== undefined) {
        delete _pubs[this[pubName$]];
      }

      Session.addToDict(v);
      this[pubName$] = v;
      if (v !== undefined) _pubs[v] = this;
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

  const logUnexpectedError = (err) => {err.error < 500 || koru.unhandledException(err)};

  async function onSubscribe([id, msgId, name, args, lastSubscribed]) {
    util.thread.action = 'subscribe ' + name;
    const subs = this._subs;
    if (subs == null) return; // we are closed

    if (name === undefined) {
      const sub = subs[id];
      if (sub !== undefined) {
        stopped(sub);
        sub.stop();
      }
      return;
    }

    if (name === null) {
      const sub = subs[id];
      if (sub === undefined) return;
      try {
        this.sendBinary('Q', [id, msgId, 0, await TransQueue.transaction(() => sub.onMessage(args))]);
      } catch (err) {
        logUnexpectedError(err);
        this.sendBinary('Q', [id, msgId, -(err.error ?? 500), err.reason ?? err.toString()]);
      }
      return;
    }

    const Sub = _pubs[name];
    if (Sub === undefined) {
      const msg = 'unknown publication: ' + name;
      this.sendBinary('Q', [id, msgId, 500, msg]);
      koru.info(msg);
    } else {
      let sub;
      try {
        let subStartTime;
        await TransQueue.transaction(() => {
          subStartTime = util.dateNow();
          sub = subs[id] ??= new Sub({id, conn: this, lastSubscribed});
          return sub.init(args);
        });
        subs[id] !== undefined && this.sendBinary('Q', [
          id, msgId, 200, sub.lastSubscribed = subStartTime]); // ready

      } catch (err) {
        logUnexpectedError(err);
        this.sendBinary('Q', [id, msgId, err.error ?? 500, err.reason ?? err.toString()]);
        if (sub !== undefined) {
          stopped(sub);
          sub.stop();
        }
      }
    }
  }

  return Publication;
});

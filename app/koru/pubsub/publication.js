define((require, exports, module)=>{
  const koru            = require('koru');
  const Session         = require('koru/session');
  const util            = require('koru/util');

  const pubName$ = Symbol(),
        stopped$ = Symbol(), module$ = Symbol();

  const _pubs = Object.create(null);

  const deletePublication = (name)=>{
    delete _pubs[name];
  };

  const stopped = (sub)=>{
    sub[stopped$] = true;
    if (sub.conn._subs !== null) delete sub.conn._subs[sub.id];
  };

  class Publication {
    constructor({id, conn, lastSubscribed}) {
      this.conn = conn;
      this.id = id;
      this.lastSubscribed = +lastSubscribed || 0;
      if (this.lastSubscribed != 0 &&
          util.dateNow() - this.constructor.lastSubscribedMaximumAge > this.lastSubscribed)
        throw new koru.Error(400, {lastSubscribed: "too_old"});
      this[stopped$] = false;
    }

    init(args) {}                    // override me
    onMessage(message) {}            // override me
    userIdChanged(newUID, oldUID) {} // override me

    stop() {
      if (this[stopped$]) return;
      stopped(this);
      this.conn.sendBinary('Q', [this.id]);
    }

    get isStopped() {return this[stopped$]}

    get userId() {return this.conn.userId}
    set userId(v) {this.conn.userId = v}

    get discreteLastSubscribed() {
      const {lastSubscribedInterval} = this.constructor;
      return Math.floor(this.lastSubscribed/lastSubscribedInterval)*lastSubscribedInterval;
    }

    static get pubName() {return this[pubName$]}
    static set pubName(v) {
      if (Session._commands.Q !== onSubscribe)
        Session.provide('Q', onSubscribe);

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
      module.onUnload(()=>{deletePublication(name)});
    }

    static get module() {return this[module$]}
  }

  Publication.lastSubscribedInterval = 5 * 60*1000;
  Publication.lastSubscribedMaximumAge = 180 * util.DAY;

  Publication.delete = deletePublication;

  function onSubscribe([id, msgId, name, args=[], lastSubscribed]) {
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
        const ans = sub.onMessage(args);
        this.sendBinary('Q', [id, msgId, 0, ans]);
      } catch(ex) {
        if (ex.error === void 0)
          koru.unhandledException(ex);
        this.sendBinary('Q', [id, msgId, -(ex.error || 500), ex.reason]);
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
        sub = subs[id] || (subs[id] = new Sub({id, conn: this, lastSubscribed}));
        sub.init(...args);
        subs[id] !== void 0 && this.sendBinary('Q', [
          id, msgId, 200, sub.lastSubscribed = util.dateNow()]); // ready

      } catch (ex) {
        if (ex.error === void 0)
          koru.unhandledException(ex);
        this.sendBinary('Q', [id, msgId, ex.error || 500, ex.reason]);
        if (sub !== void 0) {
          stopped(sub);
          sub.stop();
        }
      }
    }
  }

  return Publication;
});

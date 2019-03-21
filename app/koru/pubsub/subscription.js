define((require, exports, module)=>{
  const koru            = require('koru');
  const Query           = require('koru/model/query');
  const Observable      = require('koru/observable');
  const SubscriptionSession = require('koru/pubsub/subscription-session');
  const Session         = require('koru/session');
  const util            = require('koru/util');

  const {inspect$, private$} = require('koru/symbols');

  const module$ = Symbol(), messages$ = Symbol(),
        state$ = Symbol(), pubName$ = Symbol(), onConnect$ = Symbol();

  const {messageResponse$, connected$} = SubscriptionSession[private$];

  const STATE_NAMES = ['stopped', 'new', 'connect', 'active'];
  const STATE_MAP = {stopped: 0, new: 1, connect: 2, active: 3};

  class Subscription {
    constructor(args, session=Session) {
      this.args = args;
      this.subSession = SubscriptionSession.get(session);
      this._id = this.subSession.makeId();
      this[state$] = STATE_MAP.new;
      this.lastSubscribed = 0;
      this._matches = Object.create(null);
      this.error = null;
      this[messages$] = null;
    }

    onConnect(callback) {
      if (this[state$] === STATE_MAP.active || this[state$] === STATE_MAP.stopped) {
        callback(this.error);
        return util.noopHandle;
      } else
        return (this[onConnect$] || (this[onConnect$] = new Observable())).add(callback);
    }
    reconnecting() {}

    connect() {
      if (this.lastSubscribed != 0) {
        const {lastSubscribedMaximumAge} = this.constructor;
        if (lastSubscribedMaximumAge == -1 || this.lastSubscribed < lastSubscribedMaximumAge)
          this.lastSubscribed = 0;
      }
      this.error = null;
      this[state$] = STATE_MAP.connect;
      this.subSession.connect(this);
    }

    userIdChanged(newUID, oldUID) {
      this.stop();
      this.connect();
    }

    onMessage(message) {}

    filterDoc(doc) {return this.subSession.filterDoc(doc)}

    stop(error) {
      const {_matches} = this;
      for (const _ in _matches) {
        this._matches = Object.create(null);
        for (const name in _matches) _matches[name] !== void 0 && _matches[name].delete();
        break;
      }
      if (this[state$] !== STATE_MAP.stopped) {
        const oldState = this[state$];
        this[state$] = STATE_MAP.stopped;
        const {subSession} = this;
        subSession._delete(this);
        const onConnect = this[onConnect$];
        try {
          this.stopped(doc => {subSession.filterDoc(doc, 'stopped')});
        } finally {
          const msgCallbacks = this[messages$];
          if (error !== void 0) {
            this.error = error;
            onConnect !== void 0 && onConnect.notify(error);
            if (msgCallbacks !== null) {
              this[messages$] = null;
              msgCallbacks.forEach(cb => cb(error));
            }
          } else if (onConnect !== void 0 && oldState !== STATE_MAP.stopped) {
            const error = new koru.Error(409, 'stopped');
            onConnect.notify(error);
            if (msgCallbacks !== null) {
              this[messages$] = null;
              msgCallbacks.forEach(cb => cb(error));
            }
          }
        }
      }
    }

    [inspect$]() {return `${this.constructor.pubName}Subscription("${this._id}")`}

    stopped(unmatch) {} // just for overriding

    get state() {return STATE_NAMES[this[state$]]}
    get isClosed() {return this[state$] <= 1}

    match(modelName, test) {
      if (typeof modelName !== 'string')
        modelName = modelName.modelName;
      const {_matches} = this;
      if (_matches[modelName] !== void 0)
        _matches[modelName].delete();
      this._matches[modelName] = this.subSession.match.register(modelName, test);
    }

    unmatch(modelName) {
      if (typeof modelName !== 'string')
        modelName = modelName.modelName;
      const handle = this._matches[modelName];
      if (handle !== void 0) {
        this._matches[modelName] = void 0;
        handle.delete();
      }
    }

    filterModels(...modelNames) {
      this.subSession.filterModels(modelNames);
    }

    postMessage(message, callback) {
      const msgId = this.subSession.postMessage(this, message);
      if (msgId == -1 && callback !== void 0)
        this.onConnect(callback);
      else if (callback !== void 0) {
        (this[messages$] || (this[messages$] = []))[msgId] = callback;
      }
    }

    static get pubName() {return this[pubName$] || this.name}
    static set pubName(v) {this[pubName$] = v}

    static set module(module) {
      this[module$] = module;
      this[pubName$] = util.moduleName(module).replace(/Sub(?:scription)?$/, '');
    }

    static get module() {return this[module$]}

    static subscribe(args, callback) {
      const sub = new this(args);
      callback !== void 0 && sub.onConnect(callback);
      sub.connect();
      return sub;
    }

    static get lastSubscribedMaximumAge() {return -1}

    [connected$]({lastSubscribed}) {
      switch (this[state$]) {
      case STATE_MAP.connect:
        this[state$] = STATE_MAP.active;
        this.lastSubscribed = +lastSubscribed || 0;
        const onConnect = this[onConnect$];
        if (onConnect !== void 0) {
          this[onConnect$] = void 0;
          onConnect.notify(null);
        }
        break;
      }
    }

    [messageResponse$](data) {
      const callback = this[messages$] === null ? void 0 : this[messages$][data[1]];
      if (callback !== void 0) {
        this[messages$][data[1]] = void 0;
        const status = data[2];
        if (status == 0)
          callback(null, data[3]);
        else
          callback(new koru.Error(-status, data[3]));
      }
    }
  }

  Subscription.markForRemove = doc =>{
    Query.simDocsFor(doc.constructor)[doc._id] = ['del', void 0];
  };

  return Subscription;
});

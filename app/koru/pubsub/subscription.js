define((require, exports, module)=>{
  const Query           = require('koru/model/query');
  const Observable      = require('koru/observable');
  const SubscriptionSession = require('koru/pubsub/subscription-session');
  const Session         = require('koru/session');
  const util            = require('koru/util');

  const {inspect$} = require('koru/symbols');

  const module$ = Symbol(),
        state$ = Symbol(), pubName$ = Symbol(), onConnect$ = Symbol();

  const assertNotStopped = (sub)=>{
    if (sub[state$] === 'stopped') throw new Error("Illegal action on stopped subscription");
  };

  class Subscription {
    constructor(args, session=Session) {
      this.args = args;
      this.subSession = SubscriptionSession.get(session);
      this._id = this.subSession.makeId();
      this[state$] = 'new';
      this.lastSubscribed = 0;
      this._matches = Object.create(null);
    }

    onConnect(callback) {
      return (this[onConnect$] || (this[onConnect$] = new Observable())).add(callback);
    }
    reconnecting() {}

    connect() {
      if (this.lastSubscribed != 0) {
        const {lastSubscribedMaximumAge} = this.constructor;
        if (lastSubscribedMaximumAge == -1 || this.lastSubscribed < lastSubscribedMaximumAge)
          this.lastSubscribed = 0;
      }
      this.subSession.connect(this);
      this[state$] = 'connect';
    }

    userIdChanged(newUID, oldUID) {
      this.stop();
      this.connect();
    }

    stop(error) {
      if (this[state$] !== 'stopped') {
        const oldState = this[state$];
        this[state$] = 'stopped';
        const {subSession} = this;
        subSession._delete(this);
        const {_matches} = this;
        this._matches = Object.create(null);
        for (const name in _matches) _matches[name] !== void 0 && _matches[name].delete();
        const onConnect = this[onConnect$];
        try {
          this.stopped(doc => {subSession.filterDoc(doc, 'stopped')});
        } finally {
          if (onConnect !== void 0) {
            if (error !== void 0)
              onConnect.notify(error);
            else if (oldState === 'connect')
              onConnect.notify({code: 409, reason: 'stopped'});
          }
        }
      }
    }

    [inspect$]() {return `${this.constructor.pubName}Subscription("${this._id}")`}

    stopped(unmatch) {} // just for overriding

    get state() {return this[state$]}

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
      const models = {};
      util.forEach(modelNames, mn => {models[mn] = true});
      this.subSession.filterModels(models);
    }

    postMessage(message, callback) {
      this.subSession.postMessage(this, message, callback);
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

    _connected({lastSubscribed}) {
      switch (this[state$]) {
      case 'connect':
        this[state$] = 'active';
        this.lastSubscribed = +lastSubscribed || 0;
        const onConnect = this[onConnect$];
        if (onConnect !== void 0) {
          this[onConnect$] = void 0;
          onConnect.notify(null);
        }
        break;
      }
    }
  }

  Subscription.markForRemove = doc =>{
    Query.simDocsFor(doc.constructor)[doc._id] = ['del', void 0];
  };

  return Subscription;
});

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
    constructor(session=Session) {
      this.subSession = SubscriptionSession.get(Session);
      this._id = this.subSession.makeId();
      this[state$] = 'stopped';
      this.lastSubscribed = 0;
      this._matches = Object.create(null);
    }

    onConnect(callback) {
      return (this[onConnect$] || (this[onConnect$] = new Observable())).add(callback);
    }
    reconnecting() {}

    connect(...args) {
      this.args = args;
      this.subSession.connect(this);
      this[state$] = 'connect';
    }

    userIdChanged(newUID, oldUID) {
      this.stop();
      this.connect(...this.args);
    }

    stop(error) {
      if (this[state$] !== 'stopped') {
        const oldState = this[state$];
        this[state$] = 'stopped';
        this.subSession._delete(this);
        const {_matches} = this;
        this._matches = Object.create(null);
        for (const name in _matches) _matches[name].delete();
        const onConnect = this[onConnect$];
        try {
          this.stopped(SubscriptionSession._filterStopped);
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
      this._matches[modelName] = SubscriptionSession.match.register(modelName, test);
    }

    filterModels(...modelNames) {
      const models = {};
      util.forEach(modelNames, mn => {models[mn] = true});
      SubscriptionSession._filterModels(models);
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
      const sub = new this();
      callback !== void 0 && sub.onConnect(callback);
      if (Array.isArray(args))
        sub.connect(...args);
      else
        sub.connect(args);
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

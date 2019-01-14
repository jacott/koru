define((require, exports, module)=>{
  const Query           = require('koru/model/query');
  const Observable      = require('koru/observable');
  const SubscriptionSession = require('koru/pubsub/subscription-session');
  const Session         = require('koru/session');
  const util            = require('koru/util');

  const {inspect$} = require('koru/symbols');

  const module$ = Symbol(),
        state$ = Symbol(), pubName$ = Symbol(), onConnect$ = Symbol();

  const observe = (sub, sym, callback)=> (
    sub[sym] || (sub[sym] = new Observable())).add(callback);

  const assertNotStopped = (sub)=>{
    if (sub[state$] === 'stopped') throw new Error("Illegal action on stopped subscription");
  };

  class Subscription {
    constructor(session=Session) {
      this.subSession = SubscriptionSession.get(session);
      this._id = this.subSession.makeId();
      this[state$] = 'setup';
      this.lastSubscribed = 0;
      this._matches = Object.create(null);
    }

    onConnect(callback) {return observe(this, onConnect$, callback)}

    connect(...args) {
      assertNotStopped(this);
      this.args = args;
      this[state$] = 'connect';
      this.subSession.connect(this);
    }

    userIdChanged(newUID, oldUID) {
      this.connect(...this.args);
    }

    stop(error) {
      if (this[state$] !== 'stopped') {
        const oldState = this[state$];
        this[state$] = 'stopped';
        this.subSession._delete(this);
        const {_matches} = this;
        this._matches = null;
        for (const name in _matches) _matches[name].delete();
        const onConnect = this[onConnect$];
        try {
          this.stopped(SubscriptionSession._filterStopped);
        } finally {
          if (onConnect !== undefined) {
            if (error !== undefined)
              onConnect.notify(error);
            else if (oldState === 'connect')
              onConnect.notify({code: 409, reason: 'stopped'});
          }
        }
      }
    }

    [inspect$]() {return `${this.constructor.pubName}Subscription("${this._id}")`}

    stopped() {} // just for overriding

    get state() {return this[state$]}

    match(modelName, test) {
      if (typeof modelName !== 'string')
        modelName = modelName.modelName;
      const {_matches} = this;
      if (_matches[modelName] !== undefined)
        _matches[modelName].delete();
      this._matches[modelName] = SubscriptionSession.match.register(modelName, test);
    }

    filterModels(...modelNames) {
      const models = {};
      util.forEach(modelNames, mn => {models[mn] = true});
      SubscriptionSession._filterModels(models);
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
      callback !== undefined && sub.onConnect(callback);
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
        if (onConnect !== undefined) {
          this[onConnect$] = undefined;
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

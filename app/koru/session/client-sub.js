define(function(require, exports, module) {
  const koru    = require('koru');
  const util    = require('koru/util');
  const Trace   = require('../trace');
  const publish = require('./publish');

  let debug_subscribe = false;
  Trace.debug_subscribe = function (value) {
    debug_subscribe = value;
  };

  function stopSub() {
    if (this._id === null) return;
    debug_subscribe && koru.logger('D', (this.waiting ? '' : '*')+'DebugSub >',
                                   this._id, this.name, 'STOP');
    const session = this.session;
    session.sendP(this._id);
    stopped(this);
    if (! this.waiting) return;

    session.state.decPending();
    this.waiting = false;
  }

  function stopped(sub) {
    if (sub._id === null) return;

    delete sub.session.subs[sub._id];
    const models = {};
    sub._stop && sub._stop();
    sub._id = null;
    killMatches(sub._matches, models);
    sub._stop = sub._matches = sub.callback = null;
    publish._filterModels(models, 'stopped');
  }

  function killMatches(matches, models) {
    matches.forEach(m => {
      if (models) models[m.modelName] = true;
      m.stop();
    });
  }

  class ClientSub {
    constructor(session, subId, name, args) {
      this.session = session;
      this._id = subId;
      this._matches = [];
      this.name = name;
      this._subscribe = publish._pubs[name];
      this.stop = stopSub.bind(this);
      this.waiting = false;
      this.repeatResponse = false;
      const cb = args[args.length - 1];
      this.args = args;
      this.callback = typeof cb === 'function' ? (args.pop(), cb) : null;
      this.lastSubscribed = 0;
    }

    onResponse(callback) {
      this.callback = callback;
      this.repeatResponse = true;
    }

    onFirstResponse(callback) {
      this.callback = callback;
    }

    get userId() {
      return koru.userId();
    }

    isStopped() {
      return ! this._id;
    }

    resubscribe(models) {
      const oldMatches = this._matches;
      this._stop && this._stop();
      this._stop = null;
      this._matches = [];
      try {
        this.isResubscribe = this._called;
        this._subscribe.apply(this, this.args);
      } catch(ex) {
        koru.error(util.extractError(ex));
      }
      this._called = true;
      this.isResubscribe = false;

      killMatches(oldMatches, models);
    }

    _wait() {
      debug_subscribe && koru.logger('D', (this.waiting ? '*' : '')+'DebugSub >',
                                     this._id, this.name, JSON.stringify(this.args));
      if (this.waiting) return;
      this.session.state.incPending();
      this.waiting = true;
    }

    _received(code, data) {
      debug_subscribe && koru.logger('D', (this.waiting ? '' : '*')+'DebugSub <',
                                     this._id, this.name, code);
      const callback = this.callback;
      if (code !== 200)
        stopped(this);
      else
        this.lastSubscribed = data;
      if (! this.waiting) return;

      this.session.state.decPending();
      this.waiting = false;
      if (callback !== null) {
        code === 200 ? callback(null) : callback([code, data]);
        if (! this.repeatResponse)
          this.callback = null;
      }
    }

    error(err) {
      koru.error(err);
      this.stop();
    }

    onStop(func) {
      this._stop = func;
    }

    filterModels(...modelNames) {
      const models = {};
      util.forEach(modelNames, mn => {models[mn] = true});
      publish._filterModels(models);
    }

    match(modelName, func) {
      this._matches.push(publish.match.register(modelName, func));
    }
  }

  return ClientSub;
});

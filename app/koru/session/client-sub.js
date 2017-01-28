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
    if (! this._id) return;
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
    if (! sub._id) return;

    delete sub.session.subs[sub._id];
    const models = {};
    sub._stop && sub._stop();
    killMatches(sub._matches, models);
    sub._stop = sub._matches = sub._id = sub.callback = null;
    publish._filterModels(models);
  }

  function killMatches(matches, models) {
    matches.forEach(function (m) {
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
      const cb = args[args.length - 1];
      if (typeof cb === 'function') {
        this.callback = cb;
        this.args = args.slice(0, -1);
      } else {
        this.callback = null;
        this.args = args;
      }
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

    _received(result) {
      debug_subscribe && koru.logger('D', (this.waiting ? '' : '*')+'DebugSub <',
                                     this._id, this.name, result ? result : 'okay');
      const callback = this.callback;
      if (result !== undefined) stopped(this);
      if (! this.waiting) return;

      this.session.state.decPending();
      this.waiting = false;
      if (callback) {
        callback(result || null);
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

    filterModels(...args) {
      const models = {};
      util.forEach(args, mn => {models[mn] = true});
      publish._filterModels(models);
    }

    match(modelName, func) {
      this._matches.push(publish.match.register(modelName, func));
    }
  }


  module.exports = ClientSub;
});

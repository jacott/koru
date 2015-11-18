define(function(require, exports, module) {
  var util = require('../util');
  var publish = require('./publish');
  var koru = require('../main');
  var login = require('../user-account/client-login');
  var message = require('./message');
  var sessState = require('./state');
  var Trace = require('../trace');

  koru.onunload(module, 'reload');

  var debug_subscribe = false;
  Trace.debug_subscribe = function (value) {
    debug_subscribe = value;
  };

  return function(session) {
    var nextId = 0;
    var subs = {};
    var ready = false;

    session.sendP = function (id, name, args) {
      ready && session.sendBinary('P', util.slice(arguments));
    };

    session.provide('P', function (data) {
      var handle = subs[data[0]];
      if (! handle) return;
      handle._received(data[1]);
    });

    var userId;

    var loginOb = login.onChange(function (state) {
      if (state === 'change') {
        if (koru.userId() === userId) return;
        userId = koru.userId();
        var models = {};
        for(var key in subs) {
          subs[key].resubscribe(models);
        }
        publish._filterModels(models);
      }
    });

    sessState.onChange(function (sessReady) {
      if (! sessReady) ready = false;
    });

    sessState.onConnect('10', Subcribe._onConnect = function () {
      ready = true;
      for(var id in subs) {
        var sub = subs[id];
        sub._wait();
        session.sendP(id, sub.name, sub.args);
      }
    });

    function Subcribe(name /*, args..., callback */) {
      if (! publish._pubs[name]) throw new Error("No client publish of " + name);

      var callback = arguments[arguments.length - 1];
      var sub = new ClientSub(
        (++nextId).toString(36), name, util.slice(arguments, 1)
      );
      if (session.interceptSubscribe && session.interceptSubscribe(name, sub, callback))
        return sub;
      subs[sub._id] = sub;
      sub._wait();
      session.sendP(sub._id, name, sub.args);
      sub.resubscribe();
      return sub;
    };

    util.extend(Subcribe, {
      // test methods

      get _subs() {return subs},
      get _nextId() {return nextId},
      unload: function () {
        sessState.stopOnConnect('10');
        loginOb && loginOb.stop();
        loginOb = null;
        session.unprovide('P');
        delete session.sendP;
        clientUpdate && clientUpdate.unload();
        clientUpdate = null;
        userId = null;
      },
      set _userId(value) {userId = value},
    });

    function ClientSub(subId, name, args) {
      this._id = subId;
      this._matches = [];
      this.name = name;
      this._subscribe = publish._pubs[name];
      var cb = args[args.length - 1];
      if (typeof cb === 'function') {
        this.callback = cb;
        this.args = args.slice(0, -1);
      } else
        this.args = args;
    }

    ClientSub.prototype = {
      constructor: ClientSub,

      get userId() {
        return koru.userId();
      },

      isStopped: function () {
        return ! this._id;
      },

      resubscribe: function (models) {
        var oldMatches = this._matches;
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
      },

      _wait: function () {
        debug_subscribe && koru.logger((this.waiting ? '*' : '')+'DebugSub >', this._id, this.name, JSON.stringify(this.args));
        if (this.waiting) return;
        sessState.incPending();
        this.waiting = true;
      },

      _received: function (result) {
        debug_subscribe && koru.logger((this.waiting ? '' : '*')+'DebugSub <', this._id, this.name, result ? result : 'okay');
        if (result !== undefined) stopped(this);
        if (! this.waiting) return;

        sessState.decPending();
        this.waiting = false;
        if (this.callback) {
          this.callback(result || null);
          this.callback = null;
        }
      },

      error: function (err) {
        koru.error(err);
        this.stop();
      },

      onStop: function (func) {
        this._stop = func;
      },

      filterModels: function () {
        var models = {};
        util.forEach(arguments, function (mn) {
          models[mn] = true;
        });
        publish._filterModels(models);
      },

      stop: function () {
        if (! this._id) return;
        debug_subscribe && koru.logger((this.waiting ? '' : '*')+'DebugSub >', this._id, this.name, 'STOP');
        session.sendP(this._id);
        stopped(this);
        if (! this.waiting) return;

        sessState.decPending();
        this.waiting = false;
      },

      match: function (modelName, func) {
        this._matches.push(publish.match.register(modelName, func));
      },
    };

    function stopped(sub) {
      if (! sub._id) return;

      delete subs[sub._id];
      var models = {};
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

    var clientUpdate = require('./client-update')(session);

    return Subcribe;
  };
});

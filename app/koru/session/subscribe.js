define(function(require, exports, module) {
  var util = require('../util');
  var publish = require('./publish');
  var env = require('../env');
  var login = require('../user-account/client-login');
  var message = require('./message');
  var sessState = require('./state');

  env.onunload(module, 'reload');

  return function(session) {
    var nextId = 0;
    var subs = {};

    session.sendP = function (id, name, args) {
      sessState.isReady() && session.sendBinary('P', util.slice(arguments));
    };

    session.provide('P', function (data) {
      data = message.decodeMessage(data);

      var handle = subs[data[0]];
      if (! handle) return;
      if (handle.waiting) {
        sessState.decPending();
        handle.waiting = false;
      }
      if (handle && handle.callback) handle.callback(data[1]||null);
    });

    login.onChange(function (state) {
      if (state = 'change') {
        var models = {};
        for(var key in subs) {
          subs[key].resubscribe(models);
        }
        publish._filterModels(models);
      }
    });

    sessState.onConnect('10', Subcribe._onConnect = function () {
      for(var id in subs) {
        var sub = subs[id];
        session.sendP(id, sub.name, sub.args);
      }
    });

    function Subcribe(name /*, args..., callback */) {
      if (! publish._pubs[name]) throw new Error("No client publish of " + name);

      var callback = arguments[arguments.length - 1];
      var sub = new ClientSub(
        (++nextId).toString(36), name, util.slice(arguments, 1)
      );
      subs[sub._id] = sub;
      Subcribe.intercept(name, sub);
      sessState.incPending();
      sub.waiting = true;
      session.sendP(sub._id, name, sub.args);
      sub.resubscribe();
      return sub;
    };

    util.extend(Subcribe, {
      // test methods

      get _subs() {return subs},
      get _nextId() {return nextId},
      intercept: function () {},
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
        return env.userId();
      },

      resubscribe: function (models) {
        var oldMatches = this._matches;
        this._matches = [];
        try {
          this.isResubscribe = this._called;
          this._subscribe.apply(this, this.args);
        } catch(ex) {
          env.error(util.extractError(ex));
        }
        this._called = true;
        this.isResubscribe = false;

        killMatches(oldMatches, models);
      },

      stop: function () {
        session.sendP(this._id);
        delete subs[this._id];
        var models = {};
        killMatches(this._matches, models);
        this._matches = [];
        publish._filterModels(models);
      },

      match: function (model, func) {
        this._matches.push(publish._registerMatch(model, func));
      },
    };

    function killMatches(matches, models) {
      for(var i = 0; i < matches.length; ++i) {
        var m = matches[i];
        if (models) models[m.modelName] = true;
        m.stop();
      }
    }

    require('./client-update')(session);

    return Subcribe;
  };
});

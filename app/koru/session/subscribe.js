define(function(require, exports, module) {
  var session = require('../session/main');
  var util = require('../util');
  require('./client-update');
  var publish = require('./publish');
  var env = require('../env');
  var UserAccount = require('../user-account/main');

  var nextId = 0;
  var subs = {};

  env.onunload(module, 'reload');

  session.provide('P', function (data) {
    var nh = data.toString().split('|');
    var handle = subs[nh[0]];
    if (handle && handle.callback) handle.callback(nh[1]||null);
  });

  UserAccount.onChange(function (state) {
    if (state = 'change') {
      var models = {};
      for(var key in subs) {
        subs[key].resubscribe(models);
      }
      publish._filterModels(models);
    }
  });

  function Subcribe(name /*, args..., callback */) {
    if (! publish._pubs[name]) throw new Error("No client publish of " + name);

    var callback = arguments[arguments.length - 1];
    var sub = new ClientSub(
      (++nextId).toString(16), publish._pubs[name], util.slice(arguments, 1)
    );
    subs[sub._id] = sub;
    Subcribe.intercept(name, sub);
    session.sendP(name + '|' + sub._id, sub.args);
    sub.resubscribe();
    return sub;
  };

  util.extend(Subcribe, {
    // test methods

    get _subs() {return subs},
    get _nextId() {return nextId},
    intercept: function () {},
  });

  function ClientSub(subId, subscribe, args) {
    this._id = subId;
    this._matches = [];
    this._subscribe = subscribe;
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
      session.sendP('|' + this._id);
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

  return Subcribe;
});

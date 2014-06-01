define(function(require, exports, module) {
  var session = require('../session/main');
  var util = require('../util');
  require('./client-update');
  var publish = require('./publish');

  var nextId = 0;
  var subs = {};

  session.provide('P', function (data) {
    var nh = data.toString().split('|');
    var handle = subs[nh[0]];
    if (handle && handle.callback) handle.callback(nh[1]||null);
  });

  function Subcribe(name /*, args..., callback */) {
    var sub = new ClientSub((++nextId).toString(16));
    var callback = arguments[arguments.length - 1];
    if (typeof callback === 'function')
      sub.callback = callback;

    sub.args = util.slice(arguments, 1, sub.callback ? -1 : arguments.length);
    subs[sub._id] = sub;
    Subcribe.intercept(name, sub);
    session.sendP(name + '|' + sub._id, sub.args);
    publish._pubs[name].apply(sub, sub.args);
    return sub;
  };

  util.extend(Subcribe, {
    // test methods

    get _subs() {return subs},
    get _nextId() {return nextId},
    intercept: function () {},
  });

  function ClientSub(subId) {
    this._id = subId;
    this._matches = [];
  }

  ClientSub.prototype = {
    constructor: ClientSub,

    stop: function () {
      session.sendP('|' + this._id);
      delete subs[this._id];
      for(var i = 0; i < this._matches.length; ++i) {
        this._matches[i].stop();
      }
      this._matches = [];
    },

    match: function (model, func) {
      this._matches.push(publish._registerMatch(model, func));
    },
  };

  return Subcribe;
});

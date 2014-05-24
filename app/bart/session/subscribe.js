define(function(require, exports, module) {
  var session = require('../session/main');
  var util = require('../util');

  var nextId = 0;
  var subs = {};

  session.provide('P', function (data) {
    var nh = data.toString().split('|');
    var handle = subs[nh[0]];
    if (handle && handle.callback) handle.callback(nh[1]||null);
  });

  function Subcribe(name /*, args..., callback */) {
    var handle = {
      stop: stopFunc,
      _id: (++nextId).toString(16),
    };
    var callback = arguments[arguments.length - 1];
    if (typeof callback === 'function')
      handle.callback = callback;

    handle.args = util.slice(arguments, 1, handle.callback ? -1 : arguments.length);
    subs[handle._id] = handle;
    session.sendP(name + '|' + handle._id, handle.args);
    return handle;
  };

  util.extend(Subcribe, {
    // test methods

    get _subs() {return subs},
    get _nextId() {return nextId},
  });

  function stopFunc() {
    session.sendP('|' + this._id);
    delete subs[this._id];
  }

  return Subcribe;
});

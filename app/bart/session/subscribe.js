define(function(require, exports, module) {
  var session = require('../session/main');
  var util = require('../util');

  var nextId = 0;
  var subs = {};

  function Subcribe(name /*, args..., callback */) {
    var args = util.slice(arguments, 1, (typeof arguments[arguments.length - 1] === 'function') ? -1 : arguments.length);
    var handle = {
      stop: stopFunc,
      _id: ++nextId,
    };
    subs[nextId] = args;
    session.sendP(name + '|' + handle._id, args);
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

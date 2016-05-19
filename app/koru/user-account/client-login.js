define(function(require, exports, module) {
  var util = require('../util');
  var makeSubject = require('../make-subject');
  var koru = require('../main');

  var sessMap = {};

  util.extend(exports, {
    onChange: function (session, func) {
      var subject = sessMap[session._id] || (sessMap[session._id] = makeSubject({}));
      return subject.onChange(func);
    },
    setUserId: function (session, id) {
      util.thread.userId = id;
      setState(session, 'change');
    },

    ready: function (session) {
      setState(session, 'ready');
    },

    failed: function (session) {
      setState(session, 'failure');
    },

    wait: function (session) {
      setState(session, 'wait');
    },

    getState: function (session) {
      var subject = sessMap[session._id];
      return subject && subject.state;
    }
  });

  function setState(session, state) {
    var subject = sessMap[session._id];
    if (! subject) return;
    subject.state = state;
    subject.notify(state);
  }
});

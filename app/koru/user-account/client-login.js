define(function(require, exports, module) {
  var util = require('../util');
  var makeSubject = require('../make-subject');
  var koru = require('../main');

  var sessMap = {};

  util.merge(exports, {
    onChange(session, func) {
      var subject = sessMap[session._id] || (sessMap[session._id] = makeSubject({}));
      return subject.onChange(func);
    },
    setUserId(session, id) {
      util.thread.userId = id;
      setState(session, 'change');
    },

    ready(session) {
      setState(session, 'ready');
    },

    failed(session) {
      setState(session, 'failure');
    },

    wait(session) {
      setState(session, 'wait');
    },

    getState(session) {
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

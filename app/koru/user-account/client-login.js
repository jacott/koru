define((require) => {
  'use strict';
  const Observable      = require('koru/observable');
  const util            = require('koru/util');

  const sessMap = {};

  const setState = (session, state) => {
    const subject = sessMap[session._id];
    if (! subject) return;
    subject.state = state;
    subject.notify(state);
  };

  return {
    onChange(session, func) {
      const subject = sessMap[session._id] ?? (sessMap[session._id] = new Observable());
      return subject.onChange(func);
    },
    setUserId(session, id) {
      id = id || session.DEFAULT_USER_ID;
      if (util.thread.userId !== id) {
        util.thread.userId = id;
        setState(session, 'change');
      }
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
      const subject = sessMap[session._id];
      return subject && subject.state;
    },

    stop(session) {
      sessMap[session._id] = void 0;
    },
  };
});

define((require, exports, module)=>{
  const koru            = require('../main');
  const makeSubject     = require('../make-subject');
  const util            = require('../util');

  const sessMap = {};

  const setState = (session, state)=>{
    const subject = sessMap[session._id];
    if (! subject) return;
    subject.state = state;
    subject.notify(state);
  };

  return {
    onChange(session, func) {
      const subject = sessMap[session._id] || (sessMap[session._id] = makeSubject({}));
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
      const subject = sessMap[session._id];
      return subject && subject.state;
    }
  };
});

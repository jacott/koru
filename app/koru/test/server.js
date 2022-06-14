define((require) => {
  'use strict';
  const Test            = require('./main');
  const session         = require('../session/base');

  Test.testHandle = (cmd, msg) => {session.remoteControl.testHandle(cmd + msg)};

  Test.logHandle = (type, msg) => {
    if (session.remoteControl?.logHandle !== void 0) {
      session.remoteControl.logHandle(msg);
    } else {
      console.log(msg);
    }
  };

  return Test;
});

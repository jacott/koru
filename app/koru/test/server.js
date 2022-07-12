define((require) => {
  'use strict';
  const koru            = require('koru');
  const util            = require('koru/util');
  const Test            = require('./main');
  const session         = require('../session/base');

  process.on('unhandledRejection', (error) => {
    if (! (error instanceof Error)) {
      error = util.inspect(error);
    }
    const msg = 'Unhandled Rejection ' + error;
    const {Core} = Test;
    if (Core.test != null) {
      new Core.AssertionError(msg);
    } else {
      koru.error(msg);
    }
    koru.unhandledException(error);
  });

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

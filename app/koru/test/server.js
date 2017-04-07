define(function(require, exports, module) {
  const session = require('../session/base');
  const test    = require('./main');

  test.testHandle = function (cmd, msg) {
    session.remoteControl.testHandle(cmd+msg);
  };

  test.logHandle = function (type, msg) {
    if (session.remoteControl.logHandle)
      session.remoteControl.logHandle(msg);
    else
      console.log(msg);
  };

  return test;
});

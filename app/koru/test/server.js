define(['./main', '../session/base'], function(test, session) {
  test.testHandle = function (cmd, msg) {
    session.remoteControl.testHandle(cmd+msg);
  };

  test.logHandle = function (msg) {
    session.remoteControl.logHandle(msg);
  };

  return test;
});

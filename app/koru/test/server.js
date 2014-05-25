define(['./main', '../session/server-main'], function(koruTest, session) {
  koruTest.testHandle = function (cmd, msg) {
    session.remoteControl.testHandle(cmd+msg);
  };

  koruTest.logHandle = function (msg) {
    session.remoteControl.logHandle(msg);
  };

  return koruTest;
});

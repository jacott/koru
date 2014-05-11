define(['./main', 'bart/session-server'], function(bartTest, session) {
  bartTest.testHandle = function (cmd, msg) {
    session.remoteControl.testHandle(cmd+msg);
  };

  bartTest.logHandle = function (msg) {
    session.remoteControl.logHandle(msg);
  };

  return bartTest;
});

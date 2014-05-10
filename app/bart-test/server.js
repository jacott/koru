define(['./main', 'bart/session-server'], function(bartTest, session) {
  bartTest.testHandle = function (cmd, msg) {
    session.remoteControl.testHandle('Server', cmd+msg);
  };

  bartTest.logHandle = function (msg) {
    session.remoteControl.logHandle('Server', msg);
  };

  return bartTest;
});

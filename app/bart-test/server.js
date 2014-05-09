define(['./main', 'bart/session-server'], function(bartTest, session) {
  bartTest.testHandle = function (cmd, msg) {
    session.remoteControl.testHandle('Server', cmd+msg);
  };

  return bartTest;
});

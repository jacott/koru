define(['./main', 'bart/session'], function(bartTest, session) {
  bartTest.testHandle = function (cmd, msg) {
    session.send('T', cmd+msg);
  };

  bartTest.logHandle = function (msg) {
    session.send('L', msg);
  };
  return bartTest;
});

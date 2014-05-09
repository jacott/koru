define(['./main', 'bart/session'], function(bartTest, session) {
  bartTest.testHandle = function (cmd, msg) {
    session.send('T', cmd+msg);
  };
  return bartTest;
});

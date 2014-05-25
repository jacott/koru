define(['./main', '../session/client-main'], function(koruTest, session) {
  koruTest.testHandle = function (cmd, msg) {
    session.send('T', cmd+msg);
  };

  koruTest.logHandle = function (msg) {
    session.send('L', msg);
  };
  return koruTest;
});

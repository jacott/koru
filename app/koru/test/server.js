define((require)=>{
  const session         = require('../session/base');
  const test            = require('./main');

  test.testHandle = (cmd, msg)=>{session.remoteControl.testHandle(cmd+msg)};

  test.logHandle = (type, msg)=>{
    if (session.remoteControl.logHandle)
      session.remoteControl.logHandle(msg);
    else
      console.log(msg);
  };

  return test;
});

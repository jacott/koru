define((require)=>{
  'use strict';
  const session         = require('../session/base');
  const Test            = require('./main');

  Test.testHandle = (cmd, msg)=>{session.remoteControl.testHandle(cmd+msg)};

  Test.logHandle = (type, msg)=>{
    if (session.remoteControl.logHandle)
      session.remoteControl.logHandle(msg);
    else
      console.log(msg);
  };

  return Test;
});

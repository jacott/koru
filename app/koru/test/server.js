define(function(require, exports, module) {
  var test = require('./main');
  var session = require('../session/base');

  test.testHandle = function (cmd, msg) {
    session.remoteControl.testHandle(cmd+msg);
  };

  test.logHandle = function (type, msg) {
    session.remoteControl.logHandle(msg);
  };

  return test;
});

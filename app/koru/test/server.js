define(function(require, exports, module) {
  var test = require('./main');
  var session = require('../session/base');

  test.testHandle = function (cmd, msg) {
    session.remoteControl.testHandle(cmd+msg);
  };

  test.logHandle = function (msg) {
    session.remoteControl.logHandle(msg);
  };

  module.ctx.onError = function (err) {
  };

  return test;
});

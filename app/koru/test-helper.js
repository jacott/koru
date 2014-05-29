define(function(require, exports, module) {
  var env = require('./env');
  var TH = require('./test/main');

  var util = env.util;
  var geddon = TH.geddon;

  TH = env.util.reverseExtend({
    silenceLogger: function (func) {
      var logger = geddon.test.stub(env, 'logger');
      if (func) {
        try {
          func();
        } finally {
          logger.restore();
        }
      } else {
        geddon.test.onEnd(function () {
          logger.restore();
        });
      }
    },

    util: env.util,

    login: function (id, func) {
      var oldId = util.thread.userId;
      try {
        util.thread.userId = id;
        func();
      }
      finally {
        util.thread.userId = oldId;
      }
    },
  }, TH);

  var ga = geddon.assertions;

  ga.add('accessDenied', {
    assert: function (func) {
      var error;
      try {
        func.call();
      } catch(e) {error = e;}
      if (error) {
        if (error.error === 403 && error.reason === "Access denied")
          return true;

        throw error;
      }
      return false;
    },

    assertMessage: "Expected AccessDenied",
    refuteMessage: "Did not expect AccessDenied",
  });

  ga.add('invalidRequest', {
    assert: function (func) {
      var error;
      try {
        func.call();
      } catch(e) {error = e;}
      if (error) {
        if (error.error === 400 && error.reason.match(/^Invalid request/))
          return true;

        throw error;
      }
      return false;
    },

    assertMessage: "Expected Invalid request",
    refuteMessage: "Did not expect Invalid request",
  });

  return TH;
});

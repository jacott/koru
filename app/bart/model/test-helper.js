define(function(require, exports, module) {
  var core = require('../core');
  var bt = require('bart/test');
  var geddon = bt.geddon;

  var TH = core.util.reverseExtend({
    clearDB: function () {

    },

    silenceLogger: function (func) {
      var logger = geddon.test.stub(core, 'logger');
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
  }, bt);

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

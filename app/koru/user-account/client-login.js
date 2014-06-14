define(function(require, exports, module) {
  var util = require('../util');
  var makeSubject = require('../make-subject');
  var env = require('../env');

  makeSubject(exports);

  util.extend(exports, {
    setUserId: function (id) {
      env.util.thread.userId = id;
      setState('change');
    },

    ready: function () {
      setState('ready');
    },

    failed: function () {
      setState('failure');
    },

    wait: function () {
      setState('wait');
    },
  });

  function setState(state) {
    exports.notify(exports.state = state);
  }
});

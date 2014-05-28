define(function(require, exports, module) {
  var session = require('../session/client-main');
  var localStorage = require('../local-storage');
  var makeSubject = require('../make-subject');

  session.onConnect(onConnect);

  session.provide('V', function (data) {
    setState(data[0] === 'S' ? 'success' : 'failure');
  });

  function onConnect() {
    var token = localStorage.getItem('koru.loginToken');
    if (token) {
      session.send('VL', token);
      setState('wait');
    }
  }

  exports = {
    state: null,
    _onConnect: onConnect,
  };

  makeSubject(exports);

  function setState(state) {
    exports.notify(exports.state = state);
  }

  return exports;
});

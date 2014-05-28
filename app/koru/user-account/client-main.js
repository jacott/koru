define(function(require, exports, module) {
  var session = require('../session/client-main');
  var localStorage = require('../local-storage');
  var makeSubject = require('../make-subject');
  var SRP = require('../srp/srp');

  session.onConnect(onConnect);

  session.provide('V', function (data) {
    switch(data[0]) {
    case 'S': setState('success'); break;
    case 'F': setState('failure'); break;
    case 'C': exports._changePasswordCallback(data[1] === 'S' ? null : 'failure'); break;
    }
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

    loginWithPassword: function (email, password, callback) {
      var srp = new SRP.Client(password);
      var request = srp.startExchange();
      request.email = email;
      session.rpc('SRPBegin', request, function (err, result) {
        var response = srp.respondToChallenge(result);
        session.rpc('SRPLogin', response, function (err, result) {
          if (srp.verifyConfirmation({HAMK: result.HAMK}))
            callback();
          else
            callback('failure');
        });
      });
    },

    changePassword: function (oldPassword, newPassword, callback) {
      this._changePasswordCallback = callback;
      session.send('VC', oldPassword+'\n'+newPassword);
    },
  };

  makeSubject(exports);

  function setState(state) {
    exports.notify(exports.state = state);
  }

  return exports;
});

define(function(require, exports, module) {
  var session = require('../session/client-main');
  var localStorage = require('../local-storage');
  var makeSubject = require('../make-subject');
  var SRP = require('../srp/srp');
  var env = require('../env');

  session.onConnect(onConnect);

  session.provide('V', function (data) {
    switch(data[0]) {
    case 'S':
      env.util.thread.userId = data.slice(1).toString();
      setState('success');
      break;
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
      SRPCall(
        'SRPLogin', email, password, callback,
        function() {},
        function (err, result) {
          env.util.thread.userId = result.userId;
          localStorage.setItem('koru.loginToken', result.loginToken);
          callback();
        }
      );
    },

    changePassword: function (email, oldPassword, newPassword, callback) {
      SRPCall(
        'SRPChangePassword', email, oldPassword, callback,
        function (response) {
          response.newPassword = SRP.generateVerifier(newPassword);
        },
        function () {callback()}
      );
    },
  };

  makeSubject(exports);

  function setState(state) {
    exports.notify(exports.state = state);
  }

  function SRPCall(method, email, password,  callback, modifyResponse, responseFunc) {
    var srp = new SRP.Client(password);
    var request = srp.startExchange();
    request.email = email;
    session.rpc('SRPBegin', request, function (err, result) {
      if (err) {callback(err); return;}
      var response = srp.respondToChallenge(result);
      modifyResponse(response);
      session.rpc(method, response, function (err, result) {
        if (! err && srp.verifyConfirmation({HAMK: result.HAMK})) {
          responseFunc(err, result);
        } else
          callback(err || 'failure');
      });
    });
  }

  return exports;
});

define(function(require, exports, module) {
  var session = require('../session/main');
  var localStorage = require('../local-storage');
  var makeSubject = require('../make-subject');
  var SRP = require('../srp/srp');
  var env = require('../env');

  session.provide('V', function (data) {
    switch(data[0]) {
    case 'S':
      env.util.thread.userId = data.slice(1).toString() || null;
      setState('change');
      break;
    case 'F': setState('failure'); break;
    case 'C':
      setState('ready');
      break;
    }
  });

  env.onunload(module, function () {
    exports.stop();
  });

  function onConnect() {
    var token = localStorage.getItem('koru.loginToken');
    if (token) {
      session.send('VL', token);
      setState('wait');
    }
  }

  exports = {
    init: function () {
      session.onConnect(onConnect);
    },

    stop: function () {
      session.stopOnConnect(onConnect);
    },

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

    resetPassword: function () {

    },

    logout: function () {
      session.send('VX');
    },

    logoutOtherClients: function () {
      session.send('VO');
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
      if (err) {
        if (callback)
          callback(err);
        else
          env.error("Authentication error: " + err);
        return;
      }
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

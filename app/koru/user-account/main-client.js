define(function(require, exports, module) {
  var session = require('../session/client-rpc');
  var localStorage = require('../local-storage');
  var login = require('./client-login');
  var SRP = require('../srp/srp');
  var koru = require('../main');
  var sessState = require('../session/state');

  session.provide('V', function (data) {
    switch(data[0]) {
    case 'T':
      localStorage.setItem('koru.loginToken', data.slice(1).toString());
      break;
    case 'S':
      login.setUserId(data.slice(1).toString() || null);
      break;
    case 'F':
      login.failed();
      break;
    case 'C':
      login.ready();
      break;
    }
  });

  koru.onunload(module, function () {
    exports.stop();
  });

  function onConnect() {
    var token = localStorage.getItem('koru.loginToken');
    if (token) {
      session.send('VL', token);
      login.wait();
    } else {
      login.ready();
    }
  }

  exports = {
    init: function () {
      sessState.onConnect('05', onConnect);
    },

    stop: function () {
      sessState.stopOnConnect('05');
    },

    state: null,
    _onConnect: onConnect,

    loginWithPassword: function (email, password, callback) {
      SRPCall(
        'SRPLogin', email, password, callback,
        function() {},
        function (err, result) {
          localStorage.setItem('koru.loginToken', result.loginToken);
          login.setUserId(result.userId);
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

    resetPassword: function (key, secret, callback) {
      session.rpc('resetPassword', key, SRP.generateVerifier(secret), callback);
    },

    logout: function () {
      session.send('VX'+localStorage.getItem('koru.loginToken'));
      localStorage.removeItem('koru.loginToken');
    },

    logoutOtherClients: function () {
      session.send('VO'+localStorage.getItem('koru.loginToken'));
    },

    secureCall: function (method, email, password, payload, callback) {
      SRPCall(method, email, password, callback, function (response) {
        response.payload = payload;
      });
    },
  };

  function SRPCall(method, email, password,  callback, modifyResponse, responseFunc) {
    var srp = new SRP.Client(password);
    var request = srp.startExchange();
    request.email = email;
    session.rpc('SRPBegin', request, function (err, result) {
      if (err) {
        if (callback)
          callback(err);
        else
          koru.error("Authentication error: " + err);
        return;
      }
      var response = srp.respondToChallenge(result);
      modifyResponse(response);
      session.rpc(method, response, function (err, result) {
        if (! responseFunc) {
          callback && callback(err, result);

        } else if (! err && srp.verifyConfirmation({HAMK: result.HAMK})) {
          responseFunc && responseFunc(err, result);
        } else
          callback && callback(err || 'failure');
      });
    });
  }

  return exports;
});

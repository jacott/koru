define(function(require, exports, module) {
  const localStorage = require('../local-storage');
  const koru         = require('../main');
  const session      = require('../session/client-rpc');
  const SRP          = require('../srp/srp');
  const login        = require('./client-login');

  koru.onunload(module, function () {
    exports.stop();
  });

  let storage = localStorage;

  function onConnect(session) {
    var token = exports.token;
    if (token) {
      session.send('VL', token);
      login.wait(session);
    } else {
      login.ready(session);
    }
  }

  exports = {
    get token() {return storage.getItem('koru.loginToken')},
    set token(value) {
      return value ? storage.setItem('koru.loginToken', value) :
        storage.removeItem('koru.loginToken');
    },
    get storage() {return storage},
    set storage(value) {storage=value},
    init() {
      session.provide('V', function (data) {
        switch(data[0]) {
        case 'T':
          exports.token = data.slice(1).toString();
          break;
        case 'S':
          const [userId, crypto] = data.slice(1).toString().split(':');
          login.setUserId(this, userId || null);
          this.sessAuth = crypto;
          break;
        case 'F':
          login.failed(this);
          break;
        case 'C':
          login.ready(this);
          break;
        }
      });

      session.state.onConnect('05-login', onConnect);
    },

    stop() {
      session.unprovide('V');
      session.state.stopOnConnect('05-login');
    },

    state: null,
    _onConnect: onConnect,

    loginWithPassword(email, password, callback) {
      SRPCall(
        'SRPLogin', email, password, callback,
        function() {},
        function (err, result) {
          exports.token = result.loginToken;
          login.setUserId(session, result.userId);
          callback();
        }
      );
    },

    changePassword(email, oldPassword, newPassword, callback) {
      SRPCall(
        'SRPChangePassword', email, oldPassword, callback,
        function (response) {
          response.newPassword = SRP.generateVerifier(newPassword);
        },
        function () {callback()}
      );
    },

    resetPassword(key, secret, callback) {
      session.rpc('resetPassword', key, SRP.generateVerifier(secret), callback);
    },

    logout() {
      session.send('VX'+exports.token);
      exports.token = null;
    },

    logoutOtherClients() {
      session.send('VO'+exports.token);
    },

    secureCall(method, email, password, payload, callback) {
      SRPCall(method, email, password, callback, function (response) {
        response.payload = payload;
      });
    },
  };

  function SRPCall(method, email, password,  callback, modifyResponse, responseFunc) {
    const srp = new SRP.Client(password);
    const request = srp.startExchange();
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

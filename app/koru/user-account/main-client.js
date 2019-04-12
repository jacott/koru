define((require, exports, module)=>{
  'use strict';
  const localStorage    = require('../local-storage');
  const koru            = require('../main');
  const session         = require('../session/client-rpc');
  const SRP             = require('../srp/srp');
  const login           = require('./client-login');

  const {test$} = require('koru/symbols');

  let storage = localStorage;

  const onConnect = session =>{
    const {token} = UserAccount;
    if (token) {
      session.send('VL', token);
      login.wait(session);
    } else {
      login.ready(session);
    }
  };

  const UserAccount = {
    get token() {return storage.getItem('koru.loginToken')},
    set token(value) {
      return value ? storage.setItem('koru.loginToken', value) :
        storage.removeItem('koru.loginToken');
    },
    init() {
      session.provide('V', function (data) {
        switch(data[0]) {
        case 'T':
          UserAccount.token = data.slice(1).toString();
          break;
        case 'S':
          const [userId, crypto] = data.slice(1).toString().split(':');
          login.setUserId(this, userId);
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

    loginWithPassword(email, password, callback) {
      SRPCall(
        'SRPLogin', email, password, callback,
        ()=>{},
        (err, result)=>{
          UserAccount.token = result.loginToken;
          login.setUserId(session, result.userId);
          callback();
        }
      );
    },

    changePassword(email, oldPassword, newPassword, callback) {
      SRPCall(
        'SRPChangePassword', email, oldPassword, callback,
        response =>{response.newPassword = SRP.generateVerifier(newPassword)},
        ()=>{callback()}
      );
    },

    resetPassword(key, secret, callback) {
      session.rpc('resetPassword', key, SRP.generateVerifier(secret), callback);
    },

    logout() {
      session.send('VX'+UserAccount.token);
      UserAccount.token = null;
    },

    logoutOtherClients() {
      session.send('VO'+UserAccount.token);
    },

    secureCall(method, email, password, payload, callback) {
      SRPCall(method, email, password, callback, response =>{response.payload = payload});
    },

    [test$]: {
      get storage() {return storage},
      set storage(value) {storage=value},
      onConnect,
    }
  };

  session.defineRpcGet('resetPassword', ()=>{});
  session.defineRpcGet('SRPBegin', ()=>{});
  session.defineRpcGet('SRPLogin', ()=>{});
  session.defineRpcGet('SRPChangePassword', ()=>{});

  function SRPCall(method, email, password,  callback, modifyResponse, responseFunc) {
    const srp = new SRP.Client(password);
    const request = srp.startExchange();
    request.email = email;
    session.rpc('SRPBegin', request, (err, result)=>{
      if (err) {
        if (callback)
          callback(err);
        else
          koru.error("Authentication error: " + err);
        return;
      }
      const response = srp.respondToChallenge(result);
      modifyResponse(response);
      session.rpc(method, response, (err, result)=>{
        if (! responseFunc) {
          callback && callback(err, result);

        } else if (! err && srp.verifyConfirmation({HAMK: result.HAMK})) {
          responseFunc && responseFunc(err, result);
        } else
          callback && callback(err || 'failure');
      });
    });
  }

  koru.onunload(module, ()=>{UserAccount.stop()});

  return UserAccount;
});

define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const localStorage    = require('koru/local-storage');
  const session         = require('koru/session/client-rpc');
  const SRP             = require('koru/srp/srp');
  const login           = require('./client-login');

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

  session.defineRpcGet('UserAccount.loginWithPassword');
  session.defineRpcGet('UserAccount.changePassword');
  session.defineRpcGet('UserAccount.secureCall');

  const DEFAULT_MODE = 'plain';
  const MODES = {srp: 'srp', plain: 'plain', default: DEFAULT_MODE};
  let mode = DEFAULT_MODE;

  const stop = ()=>{
    session.unprovide('V');
    session.state.stopOnConnect('05-login');
  };

  const SRPCall = (method, email, password,  callback, modifyResponse, responseFunc)=>{
    const srp = new SRP.Client(password);
    const request = srp.startExchange();
    request.email = email;
    session.rpc('SRPBegin', request, (err, result)=>{
      if (err != null) {
        if (callback !== void 0)
          callback(err);
        else
          koru.error("Authentication error: " + err);
        return;
      }
      const response = srp.respondToChallenge(result);
      modifyResponse(response);
      session.rpc(method, response, (err, result)=>{
        if (responseFunc === void 0) {
          callback !== void 0 && callback(err, result);

        } else if (! err && srp.verifyConfirmation({HAMK: result.HAMK})) {
          responseFunc(err, result);
        } else
          callback !== void 0 && callback(err || 'failure');
      });
    });
  };

  const UserAccount = {
    get mode() {return mode},
    set mode(value) {
      const nm = MODES[value];
      if (nm === void 0) throw new Error("invalid UserAccount mode");
      mode = nm;
    },
    get token() {return storage.getItem('koru.loginToken')},
    set token(value) {
      return value ? storage.setItem('koru.loginToken', value) :
        storage.removeItem('koru.loginToken');
    },
    start() {
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

    stop,

    loginWithPassword(email, password, callback) {
      const cbwrapper = (err, result)=>{
        if (! err) {
          UserAccount.token = result.loginToken;
          login.setUserId(session, result.userId);
        }
        callback(err);
      };
      if (mode === 'plain')
        session.rpc('UserAccount.loginWithPassword', email, password, cbwrapper);
      else SRPCall(
        'SRPLogin', email, password, callback,
        ()=>{},
        cbwrapper
      );
    },

    changePassword(email, oldPassword, newPassword, callback) {
      if (mode === 'plain')
        session.rpc('UserAccount.changePassword', email, oldPassword, newPassword, callback);
      else SRPCall(
        'SRPChangePassword', email, oldPassword, callback,
        response =>{response.newPassword = SRP.generateVerifier(newPassword)},
        ()=>{callback()}
      );
    },

    resetPassword(key, newPassword, callback) {
      session.rpc('resetPassword', key, mode === 'plain'
                  ? newPassword : SRP.generateVerifier(newPassword), callback);
    },

    logout() {
      session.send('VX'+UserAccount.token);
      UserAccount.token = null;
    },

    logoutOtherClients() {
      session.send('VO'+UserAccount.token);
    },

    secureCall(method, email, password, payload, callback) {
      if (mode === 'plain')
        session.rpc('UserAccount.secureCall', method, email, password, payload, callback);
      else
        SRPCall(method, email, password, callback, response =>{response.payload = payload});
    },
  };

  if (isTest) UserAccount[isTest] = {
    get storage() {return storage},
    set storage(value) {storage=value},
    onConnect,
  };

  session.defineRpcGet('resetPassword');
  session.defineRpcGet('SRPBegin');
  session.defineRpcGet('SRPLogin');
  session.defineRpcGet('SRPChangePassword');

  module.onUnload(stop);

  return UserAccount;
});

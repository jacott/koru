define((require, exports, module)=>{
  'use strict';
  const localStorage    = require('../local-storage');
  const koru            = require('../main');
  const session         = require('../session/client-rpc');
  const SRP             = require('../srp/srp');
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
  let mode = DEFAULT_MODE;
  const MODES = {srp: 'srp', plain: 'plain', default: DEFAULT_MODE};

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

    loginWithPassword(email, password, callback) {
      if (mode === 'plain')
        session.rpc('UserAccount.loginWithPassword', email, password, callback);
      else SRPCall(
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

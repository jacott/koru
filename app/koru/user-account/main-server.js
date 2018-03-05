define(function(require, exports, module) {
  const Email           = require('koru/email');
  const koru            = require('koru/main');
  const Model           = require('koru/model/main');
  const Val             = require('koru/model/validation');
  const Random          = require('koru/random').global;
  const session         = require('koru/session');
  const SRP             = require('koru/srp/srp');
  const util            = require('koru/util');

  let emailConfig;

  const getToken = data =>{
    data = data.slice(1).toString();
    if (data.match(/^[\d\w]+\|[\d\w]+$/))
      return data.split('|');
    return [];
  };

  class UserLogin extends Model.BaseModel {
    unexpiredTokens() {
      const tokens = this.tokens;
      const now = util.dateNow();
      const keyVal = [];
      for (let key in tokens) {
        const time = tokens[key];
        if (time > now) {
          keyVal.push(time+'|'+key);
        }
      }
      keyVal.sort();
      const max = Math.min(10, keyVal.length);

      const result = {};
      for (let i = 1; i <= max; ++i) {
        const pair = keyVal[keyVal.length - i].split('|');
        result[pair[1]] = +pair[0];
      }

      return result;
    }

    makeToken() {
      const token = Random.id();
      const tokens = this.unexpiredTokens();
      tokens[token] = Date.now()+180*24*1000*60*60;
      this.tokens = tokens;
      return token;
    }
  }

  UserLogin.define({
    module,
    name: 'UserLogin',
    fields: {
      userId: 'text',
      email: 'text',
      srp: 'object',
      tokens: 'object',
      resetToken: 'text',
      resetTokenExpire: 'bigint',
    },
  });

  const UserAccount = {
    init() {
      session.provide('V', onMessage);
    },

    stop() {
      session.unprovide('V');
    },

    UserLogin,
    /**
     * @deprecated
     **/
    model: UserLogin,

    resetPassword(token, passwordHash) {
      Val.ensureString(token);
      Val.assertCheck(passwordHash, VERIFIER_SPEC);
      const parts = token.split('-');
      const lu = UserLogin.findById(parts[0]);

      if (lu && lu.resetToken === parts[1] && Date.now() < lu.resetTokenExpire) {
        lu.srp = passwordHash;
        lu.resetToken = lu.resetTokenExpire = undefined;
        const loginToken = lu.makeToken();
        lu.$$save();
        return [lu, loginToken];
      }
      throw new koru.Error(404, 'Expired or invalid reset request');
    },

    verifyClearPassword(email, password) {
      const doc = UserLogin.findBy('email', email);
      if (doc === undefined) return;

      const C = new SRP.Client(password);
      const S = new SRP.Server(doc.srp);

      const request = C.startExchange();
      const challenge = S.issueChallenge(request);
      const response = C.respondToChallenge(challenge);

      if (S.M === response.M) {
        const token = doc.makeToken();
        doc.$$save();
        return [doc, token];
      }
    },

    verifyToken(emailOrId, token) {
      const doc = emailOrId.indexOf('@') === -1 ? UserLogin.findById(emailOrId)
              : UserLogin.findBy('email', emailOrId);
      if (doc !== undefined && doc.unexpiredTokens()[token] !== undefined)
        return doc;
    },

    createUserLogin(attrs) {
      return UserLogin.create({
        email: attrs.email,
        userId: attrs.userId,
        tokens: {},
        srp: attrs.password && SRP.generateVerifier(attrs.password),
      });
    },

    makeResetPasswordKey(user) {
      const lu = UserLogin.findBy('userId', user._id);

      lu.resetToken = Random.id()+Random.id();
      lu.resetTokenExpire = Date.now() + 24*60*60*1000;
      lu.$$save();

      return lu;
    },

    sendResetPasswordEmail(user) {
      emailConfig || configureEmail();

      const lu = this.makeResetPasswordKey(user);

      Email.send({
        from: emailConfig.from,
        to: lu.email,
        subject: 'How to reset your password on ' + emailConfig.siteName,
        text: emailConfig.sendResetPasswordEmailText(user, lu._id + '-' + lu.resetToken),
      });
    },

    updateOrCreateUserLogin(attrs) {
      const lu = UserLogin.findBy('userId', attrs.userId);
      if (! lu) return UserLogin.create({
        email: attrs.email,
        userId: attrs.userId,
        tokens: {},
        srp: attrs.srp,
      });;

      const update = {};

      if (attrs.email) update.email = attrs.email;
      if (attrs.srp) update.srp = attrs.srp;
      util.isObjEmpty(update) || lu.$update(update);
      return lu;
    },

    assertResponse(conn, response) {
      if (response && conn.$srp && response.M === conn.$srp.M) return;
      throw new koru.Error(403, 'failure');
    },


    SRPBegin(state, request) {
      return SRPBegin.call(state, request);
    },
    SRPLogin(state, response) {
      return SRPLogin.call(state, response);
    },

    logout(_id, token) {
      UserLogin.onId(_id).update({$partial: {tokens: [token, null]}});
    },

    logoutOtherClients(_id, token) {
      const lu = UserLogin.findById(_id);
      if (lu) {
        const mod = {};
        if (lu.tokens[token])
          mod[token] = lu.tokens[token];
        UserLogin.where({_id: lu._id}).update('tokens', mod);
      }
    },
  };

  session.defineRpc('SRPBegin', SRPBegin);

  function SRPBegin(request) {
    const doc = UserLogin.findBy('email', request.email);
    if (doc === undefined || doc.srp == null) throw new koru.Error(403, 'failure');
    const srp = new SRP.Server(doc.srp);
    this.$srp = srp;
    this.$srpUserAccount = doc;
    return srp.issueChallenge({A: request.A});
  }

  session.defineRpc('SRPLogin', SRPLogin);

  function SRPLogin(response) {
    UserAccount.assertResponse(this, response);
    const doc = this.$srpUserAccount;
    const token = doc.makeToken();
    doc.$$save();
    const result = {
      HAMK: this.$srp && this.$srp.HAMK,
      userId: this.userId = doc.userId,
      loginToken: doc._id + '|' + token,
    };
    this.$srp = null;
    this.$srpUserAccount = null;
    return result;
  }

  const VERIFIER_SPEC = UserAccount.VERIFIER_SPEC = {
    identity: 'string', salt: 'string', verifier: 'string'};

  session.defineRpc('SRPChangePassword', function (response) {
    UserAccount.assertResponse(this, response);

    Val.assertCheck(response.newPassword, VERIFIER_SPEC);


    if (UserAccount.interceptChangePassword)
      UserAccount.interceptChangePassword(this.$srpUserAccount, response.newPassword);
    else
      this.$srpUserAccount.$update({srp: response.newPassword});

    const result = {
      HAMK: this.$srp && this.$srp.HAMK,
    };
    this.$srp = null;
    this.$srpUserAccount = null;
    return result;
  });

  session.defineRpc('resetPassword', function (token, passwordHash) {
    const result = UserAccount.resetPassword(token, passwordHash);
    const lu = result[0];
    this.send('VT', lu._id + '|' + result[1]);
    this.userId = lu.userId;
    this.loginToken = result[1];
  });

  function configureEmail() {
    emailConfig = koru.config.userAccount && koru.config.userAccount.emailConfig || {};

    if (! emailConfig.from) koru.throwConfigMissing('userAccount.emailConfig.from');
    if (! emailConfig.siteName) koru.throwConfigMissing('userAccount.emailConfig.siteName');
    if (! emailConfig.sendResetPasswordEmailText)
      koru.throwConfigMissing('userAccount.emailConfig.sendResetPasswordEmailText');
    if (typeof emailConfig.sendResetPasswordEmailText !== 'function')
      koru.throwConfigError('userAccount.sendResetPasswordEmailText',
                            'must be of type function(userId, resetToken)');
  }

  function onMessage(data) {
    const conn = this;
    const cmd = data[0];
    let token;
    switch(cmd) {
    case 'L': {
      const [_id, token] = getToken(data);
      const lu = _id && UserLogin.findById(_id);

      if (lu && lu.unexpiredTokens()[token]) {
        conn.userId = lu.userId; // will send a VS + VC. See server-connection
        conn.loginToken = token;
      } else {
        conn.send('VF');
      }
    } break;
    case 'X': { // logout me
      const [_id, token] = getToken(data);
      token && UserAccount.logout(_id, token);
      conn.userId = null; // will send a VS + VC. See server-connection
    } break;
    case 'O': {// logoutOtherClients
      if (conn.userId == null) return;
      const [_id, token] = getToken(data);
      token && UserAccount.logoutOtherClients(_id, token);
      const conns = session.conns;
      for (let sessId in conns) {
        if (sessId === conn.sessId) continue;
        const curr = conns[sessId];

        if (curr.userId === conn.userId)
          curr.userId = null;
      }
    }}
  }

  return UserAccount;
});

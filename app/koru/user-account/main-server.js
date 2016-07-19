define(function(require, exports, module) {
  const Email   = require('../email');
  const koru    = require('../main');
  const Model   = require('../model/main');
  const Val     = require('../model/validation');
  const Random  = require('../random');
  const session = require('../session/base');
  const SRP     = require('../srp/srp');
  const util    = require('../util');

  var emailConfig;

  const UserAccount = exports;

  class UserLogin extends Model.BaseModel {
    unexpiredTokens() {
      var tokens = this.tokens;
      var now = util.dateNow();
      var keyVal = [];
      for(var key in tokens) {
        var time = tokens[key];
        if (time > now) {
          keyVal.push(time+'|'+key);
        }
      }
      keyVal.sort();
      var max = Math.min(10, keyVal.length);

      var result = {};
      for(var i = 1; i <= max; ++i) {
        var pair = keyVal[keyVal.length - i].split('|');
        result[pair[1]] = +pair[0];
      }

      return result;
    }

    makeToken() {
      var token = Random.id();
      var tokens = this.unexpiredTokens();
      tokens[token] = Date.now()+180*24*1000*60*60;
      this.tokens = tokens;
      return token;
    }
  }

  UserLogin.define({
    module,
    fields: {
      userId: 'text',
      email: 'text',
      srp: 'object',
      tokens: 'object',
      resetToken: 'text',
      resetTokenExpire: 'bigint',
    },
  });

  session.defineRpc('SRPBegin', SRPBegin);

  function SRPBegin(request) {
    var doc = UserLogin.findBy('email', request.email);
    if (! doc) throw new koru.Error(403, 'failure');
    var srp = new SRP.Server(doc.srp);
    this.$srp = srp;
    this.$srpUserAccount = doc;
    return srp.issueChallenge({A: request.A});
  }

  session.defineRpc('SRPLogin', SRPLogin);

  function SRPLogin(response) {
    UserAccount.assertResponse(this, response);
    var doc = this.$srpUserAccount;
    var token = doc.makeToken();
    doc.$$save();
    var result = {
      HAMK: this.$srp && this.$srp.HAMK,
      userId: this.userId = doc.userId,
      loginToken: doc._id + '|' + token,
    };
    this.$srp = null;
    this.$srpUserAccount = null;
    return result;
  }

  var VERIFIER_SPEC = UserAccount.VERIFIER_SPEC = {identity: 'string', salt: 'string', verifier: 'string'};
  session.defineRpc('SRPChangePassword', function (response) {
    UserAccount.assertResponse(this, response);

    Val.assertCheck(response.newPassword, VERIFIER_SPEC);

    this.$srpUserAccount.$update({srp: response.newPassword});

    var result = {
      HAMK: this.$srp && this.$srp.HAMK,
    };
    this.$srp = null;
    this.$srpUserAccount = null;
    return result;
  });

  session.defineRpc('resetPassword', function (token, passwordHash) {
    var result = UserAccount.resetPassword(token, passwordHash);
    var lu = result[0];
    this.send('VT', lu._id + '|' + result[1]);
    this.userId = lu.userId;
  });

  util.extend(UserAccount, {
    init() {
      session.provide('V', onMessage);
    },

    stop() {
      session.unprovide('V');
    },

    /**
     * @deprecated
     **/
    model: UserLogin,

    UserLogin,

    resetPassword(token, passwordHash) {
      Val.ensureString(token);
      Val.assertCheck(passwordHash, VERIFIER_SPEC);
      var parts = token.split('-');
      var lu = UserLogin.findById(parts[0]);

      if (lu && lu.resetToken === parts[1] && Date.now() < lu.resetTokenExpire) {
        lu.srp = passwordHash;
        lu.resetToken = lu.resetTokenExpire = undefined;
        var loginToken = lu.makeToken();
        lu.$$save();
        return [lu, loginToken];
      }
      throw new koru.Error(404, 'Expired or invalid reset request');
    },

    verifyClearPassword(email, password) {
      var doc = UserLogin.findBy('email', email);
      if (! doc) return;

      var C = new SRP.Client(password);
      var S = new SRP.Server(doc.srp);

      var request = C.startExchange();
      var challenge = S.issueChallenge(request);
      var response = C.respondToChallenge(challenge);

      if (S.M === response.M) {
        var token = doc.makeToken();
        doc.$$save();
        return [doc, token];
      }
    },

    verifyToken(emailOrId, token) {
      if (emailOrId.indexOf('@') === -1) {
        var doc = UserLogin.findById(emailOrId);
      } else {
        var doc = UserLogin.findBy('email', emailOrId);
      }
      if (doc && doc.unexpiredTokens()[token])
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

    sendResetPasswordEmail(user) {
      emailConfig || configureEmail();

      var lu = UserLogin.findBy('userId', user._id);

      var rand = Random.create();

      lu.resetToken = Random.id()+rand.id();
      lu.resetTokenExpire = Date.now() + 24*60*60*1000;
      lu.$$save();

      Email.send({
        from: emailConfig.from,
        to: lu.email,
        subject: 'How to reset your password on ' + emailConfig.siteName,
        text: emailConfig.sendResetPasswordEmailText(user, lu._id + '-' + lu.resetToken),
      });
    },

    updateOrCreateUserLogin(attrs) {
      var lu = UserLogin.findBy('userId', attrs.userId);
      if (! lu) return UserLogin.create({
        email: attrs.email,
        userId: attrs.userId,
        tokens: {},
        srp: attrs.srp,
      });;

      var update = {email: attrs.email};

      if (attrs.srp) update.srp = attrs.srp;
      lu.$update(update);
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
  });

  function configureEmail() {
    emailConfig = koru.config.userAccount && koru.config.userAccount.emailConfig || {};

    if (! emailConfig.from) koru.throwConfigMissing('userAccount.emailConfig.from');
    if (! emailConfig.siteName) koru.throwConfigMissing('userAccount.emailConfig.siteName');
    if (! emailConfig.sendResetPasswordEmailText) koru.throwConfigMissing('userAccount.emailConfig.sendResetPasswordEmailText');
    if (typeof emailConfig.sendResetPasswordEmailText !== 'function') koru.throwConfigError('userAccount.sendResetPasswordEmailText', 'must be of type function(userId, resetToken)');
  }

  function onMessage(data) {
    var conn = this;
    var cmd = data[0];
    switch(cmd) {
    case 'L':
      var pair = data.slice(1).toString().split('|');
      var lu = UserLogin.findById(pair[0]);

      if (lu && lu.unexpiredTokens()[pair[1]]) {
        conn.userId = lu.userId; // will send a VS + VC. See server-connection
      } else {
        conn.send('VF');
      }
      break;
    case 'X': // logout me
      var token = getToken(data);
      if (token) {
        var mod = {};
        mod['tokens.'+token] = undefined;
        UserLogin.where({userId: conn.userId}).update(mod);
      }
      conn.userId = null; // will send a VS + VC. See server-connection
      break;
    case 'O': // logoutOtherClients
      if (conn.userId == null) return;
      var token = getToken(data);
      if (token) {
        var lu = UserLogin.findBy('userId', conn.userId);
        if (lu) {
          var mod = {};
          if (token in lu.tokens)
            mod[token] = lu.tokens[token];
          UserLogin.where({_id: lu._id}).update('tokens', mod);
        }
      }
      var conns = session.conns;
      for(var sessId in conns) {
        if (sessId === conn.sessId) continue;
        var curr = conns[sessId];

        if (curr.userId === conn.userId)
          curr.userId = null;
      }
      break;
    }
  }

  function getToken(data) {
    var token = data.slice(1).toString().split('|')[1];
    if (token && token.match(/^[\d\w]+$/)) return token;
  }
});

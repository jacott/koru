define(function(require, exports, module) {
  var session = require('../session/base');
  var Model = require('../model/base');
  var koru = require('../main');
  var SRP = require('../srp/srp');
  var Val = require('../model/validation');
  var Random = require('../random');
  var util = require('../util');
  var Email = require('../email');

  var emailConfig;

  session.provide('V', onMessage);

  var model = Model.define('UserLogin', {
    unexpiredTokens: function () {
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
    },

    makeToken: function () {
      var token = Random.id();
      var tokens = this.unexpiredTokens();
      tokens[token] = Date.now()+180*24*1000*60*60;
      this.tokens = tokens;
      return token;
    },

    sendNewToken: function (conn) {
      var token = this.makeToken();
      this.$$save();
      conn.send('VT', this._id + '|' + token);
      conn.userId = this.userId;
    },
  })
  .defineFields({
    userId: 'text',
    email: 'text',
    srp: 'text',
    tokens: 'has-many',
    resetToken: 'text',
    resetTokenExpire: 'number',
  });

  koru.onunload(module, function () {
    Model._destroyModel('UserLogin');
  });

  session.defineRpc('SRPBegin', function (request) {
    var doc = model.findBy('email', request.email);
    if (! doc) throw new koru.Error(403, 'failure');
    var srp = new SRP.Server(doc.srp);
    this.$srp = srp;
    this.$srpUserAccount = doc;
    return srp.issueChallenge({A: request.A});
  });

  session.defineRpc('SRPLogin', function (response) {
    exports.assertResponse(this, response);
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
  });

  var VERIFIER_SPEC = exports.VERIFIER_SPEC = Val.permitSpec('identity', 'salt', 'verifier');
  session.defineRpc('SRPChangePassword', function (response) {
    exports.assertResponse(this, response);

    Val.permitParams(response.newPassword, VERIFIER_SPEC);

    this.$srpUserAccount.$update({srp: response.newPassword});

    var result = {
      HAMK: this.$srp && this.$srp.HAMK,
    };
    this.$srp = null;
    this.$srpUserAccount = null;
    return result;
  });

  session.defineRpc('resetPassword', function (token, passwordHash) {
    Val.ensureString(token);
    Val.permitParams(passwordHash, VERIFIER_SPEC);
    var parts = token.split('-');
    var lu = model.findById(parts[0]);
    if (lu && lu.resetToken === parts[1] && Date.now() < lu.resetTokenExpire) {
      lu.srp = passwordHash;
      lu.resetToken = lu.resetTokenExpire = undefined;
      lu.sendNewToken(this);
      return;
    }
    throw new koru.Error(404, 'Expired or invalid reset request');
  });

  util.extend(exports, {
    model: model,

    veryifyClearPassword: function (email, password) {
      var doc = model.findBy('email', email);
      if (! doc) return;

      var C = new SRP.Client(password);
      var S = new SRP.Server(doc.srp);

      var request = C.startExchange();
      var challenge = S.issueChallenge(request);
      var response = C.respondToChallenge(challenge);

      if (S.M === response.M) return doc;
    },

    createUserLogin: function (attrs) {
      return model.create({
        email: attrs.email,
        userId: attrs.userId,
        tokens: {},
        srp: attrs.password && SRP.generateVerifier(attrs.password),
      });
    },

    sendResetPasswordEmail: function (userId) {
      emailConfig || configureEmail();

      var lu = model.findBy('userId', userId);

      var rand = Random.create();

      lu.resetToken = Random.id()+rand.id();
      lu.resetTokenExpire = Date.now() + 24*60*60*1000;
      lu.$$save();

      Email.send({
        from: emailConfig.from,
        to: lu.email,
        subject: 'How to reset your password on ' + emailConfig.siteName,
        text: emailConfig.sendResetPasswordEmailText(lu.userId, lu._id + '-' + lu.resetToken),
      });
    },

    updateOrCreateUserLogin: function (attrs) {
      var lu = model.findBy('userId', attrs.userId);
      if (! lu) return model.create({
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

    assertResponse: function (conn, response) {
      if (response && conn.$srp && response.M === conn.$srp.M) return;
      throw new koru.Error(403, 'failure');
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
      var lu = model.findById(pair[0]);

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
        model.where({userId: conn.userId}).update(mod);
      }
      conn.userId = null; // will send a VS + VC. See server-connection
      break;
    case 'O': // logoutOtherClients
      if (conn.userId == null) return;
      var token = getToken(data);
      if (token) {
        var lu = model.findBy('userId', conn.userId);
        if (lu) {
          var mod = {};
          if (token in lu.tokens)
            mod[token] = lu.tokens[token];
          model.where({_id: lu._id}).update('tokens', mod);
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

define(function(require, exports, module) {
  var session = require('../session/server-main');
  var Model = require('../model/main');
  var env = require('../env');
  var SRP = require('../srp/srp');
  var Val = require('../model/validation');
  var Random = require('../random');
  var util = require('../util');

  session.provide('V', validateLoginToken);

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
  })
  .defineFields({
    userId: 'text',
    email: 'text',
    srp: 'text',
    tokens: 'has-many',
  });

  env.onunload(module, function () {
    Model._destroyModel('UserLogin');
  });

  session.defineRpc('SRPBegin', function (request) {
    var doc = model.findByField('email', request.email);
    if (! doc) throw new Error('failure');
    var srp = new SRP.Server(doc.srp);
    this.$srp = srp;
    this.$srpUserAccount = doc;
    return srp.issueChallenge({A: request.A});
  });

  session.defineRpc('SRPLogin', function (response) {
    if (response.M !== this.$srp.M)
      throw new Error('failure');
    var token = Random.id();
    var doc = this.$srpUserAccount;
    var tokens = doc.unexpiredTokens();
    tokens[token] = Date.now()+180*24*1000*60*60;
    doc.tokens = tokens;
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

  var VERIFIER_SPEC = Val.permitSpec('identity', 'salt', 'verifier');
  session.defineRpc('SRPChangePassword', function (response) {
    if (response.M !== this.$srp.M)
      throw new Error('failure');
    Val.permitParams(response.newPassword, VERIFIER_SPEC);

    this.$srpUserAccount.$update({srp: response.newPassword});

    var result = {
      HAMK: this.$srp && this.$srp.HAMK,
    };
    this.$srp = null;
    this.$srpUserAccount = null;
    return result;
  });

  return {
    createUserLogin: function (attrs) {
      return model.create({
        email: attrs.email,
        userId: attrs.userId,
        tokens: attrs.tokens,
        srp: SRP.generateVerifier(attrs.password),
      });
    },
  };

  function validateLoginToken(data) {
    var conn = this;
    var pair = data.slice(1).toString().split('|');
    var lu = model.findById(pair[0]);

    if (lu && lu.tokens[pair[1]]) {
      conn.userId = lu.userId;
    } else {
      conn.ws.send('VF');
    }
  }
});

define(function(require, exports, module) {
  var session = require('../session/server-main');
  var Model = require('../model/main');
  var env = require('../env');
  var SRP = require('../srp/srp');
  var Val = require('../model/validation');

  session.provide('V', validateLoginToken);

  var model = Model.define('UserLogin')
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
    var result = {
      HAMK: this.$srp && this.$srp.HAMK,
      userId: this.userId = this.$srpUserAccount.userId,
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
    var pair = data.slice(1).toString().split('|');
    var lu = model.findById(pair[0]);

    if (lu && lu.tokens[pair[1]]) {
      this.userId = lu.userId;
      this.ws.send('VS');
    } else {
      this.ws.send('VF');
    }
  }
});

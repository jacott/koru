define(function(require, exports, module) {
  var session = require('../session/server-main');
  var Model = require('../model/main');
  var env = require('../env');
  var SRP = require('../srp/srp');

  session.provide('V', onMessage);

  var model = Model.define('UserAccount')
  .defineFields({
    userId: 'text',
    email: 'text',
    srp: 'text',
    tokens: 'has-many',
  });

  env.onunload(module, function () {
    Model._destroyModel('UserAccount');
  });

  session.defineRpc('SRPBegin', function (request) {
    var doc = model.findByField('email', request.email);
    if (! doc) throw new Error('failure');
    var srp = new SRP.Server(doc.srp);
    this.$srp = srp;
    return srp.issueChallenge({A: request.A});
  });

  session.defineRpc('SRPLogin', function () {
    var HAMK = this.$srp && this.$srp.HAMK;
    this.$srp = null;
    return {
      userId: 'uid123',
      HAMK : HAMK,
    };
  });

  return {
    createUser: function (attrs) {
      return model.create(attrs);
    },
  };

  function onMessage(data) {
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

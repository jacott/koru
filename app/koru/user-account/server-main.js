define(function(require, exports, module) {
  var session = require('../session/server-main');
  var Model = require('../model/main');
  var env = require('../env');

  session.provide('V', onMessage);

  var model = Model.define('UserAccount')
  .defineFields({
    userId: 'text',
    email: 'text',
    tokens: 'has-many',
  });

  env.onunload(module, function () {
    Model._destroyModel('UserAccount');
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

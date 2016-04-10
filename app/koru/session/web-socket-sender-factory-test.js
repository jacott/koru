define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./web-socket-sender-factory');
  var SessionBase = require('./base').__initBase__;
  var SessState = require('./state').__init__;

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.sess = sut(SessionBase(), SessState());
      v.sess.newWs = function () {return v.ws = {}};
    },

    tearDown: function () {
      v = null;
    },

    "test onerror": function () {
      v.sess.connect();
      assert.same(v.ws.onerror, v.ws.onclose);
    },

  });
});

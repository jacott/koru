define(function (require, exports, module) {
  var test, v;
  var geddon = require('../test');
  var session = require('./main');

  geddon.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
      delete session._commands.t;
    },

    "test provide": function () {
      refute(session._commands.hasOwnProperty('t'));

      refute(session.provide('t', v.t = test.stub()));
      assert.same(session.provide('t', v.t), v.t);

      assert.same(session._commands.t, v.t);
    },

    "test defining": function () {
      session.defineRpc('foo.bar', v.stub = test.stub());
      assert.same(session._rpcs['foo.bar'], v.stub);
    },
  });
});

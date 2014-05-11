define(['module', 'bart-test', 'bart/session'], function (module, geddon, session) {
  var test, v;
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
  });
});

define(['module', 'bart-test', 'bart/core'], function (module, geddon, core) {
  geddon.testCase(module, {
    "test isServer, isClient": function () {
      assert.same(isClient, typeof process === 'undefined');
      assert.same(isServer, typeof process !== 'undefined');
    },
  });
});

define(['module', 'bart-test', 'bart/core'], function (module, geddon, core) {
  geddon.testCase(module, {
    "test infrastructure": function () {
      console.log('DEBUG assert true and watched');
      assert(false, 'FIXME');
    },

    "test two": function () {
      assert.isTrue(core.isServer());

      console.log('DEBUG test two');
      assert(true);
    },
  });
});

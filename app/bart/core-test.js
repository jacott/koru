define(['module', 'bart-test'], function (module, geddon) {
  geddon.testCase(module, {
    "test infrastructure": function () {
      console.log('DEBUG assert true and watched');
      assert(false, 'FIXME');
    },

    "test two": function () {
      console.log('DEBUG test two');
      assert(true);
    },
  });
});

define(['module', 'bart-test'], function (module, bartTest) {
  bartTest.testCase(module.id, {
    "test infrastructure": function () {
      console.log('DEBUG assert true and watched');
      assert(true);
    },

    "test two": function () {
      console.log('DEBUG test two');
    },
  });
});

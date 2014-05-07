define(['module', 'bart-test'], function (module, bartTest) {
  bartTest.testCase(module, {
    "test infrastructure": function () {
      console.log('DEBUG assert true and watched');
      assert(true);
    },

    "test two": function () {
      console.log('DEBUG test two');
      assert(true);
    },
  });
});

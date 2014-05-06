define(['module', 'bart-test'], function (module, bartTest) {
  bartTest.testCase(module.id, {
    "test infrastructure": function () {
      console.log('DEBUG my first test');
      assert(true);
    },
  });
});

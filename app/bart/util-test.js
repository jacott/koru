define(['module', 'bart-test', './util'], function (module, geddon, util) {
  var test, v;
  geddon.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    'test extend': function () {
      var item = 5,
          sub={a: 1, b: 2},
          sup = {b: 3, get c() {return item;}};

      util.extend(sub,sup);

      item = 6;

      assert.same(sub.a,1);
      assert.same(sub.b,3);
      assert.same(sub.c,6);

    },

    "test regexEscape": function () {
      assert.same(util.regexEscape('ab[12]\\w.*?\\b()'), 'ab\\[12\\]\\\\w\\.\\*\\?\\\\b\\(\\)');
    },

    "test newEscRegex": function () {
      assert.match('ab[12]\\w.*?\\b()', util.newEscRegex('ab[12]\\w.*?\\b()'));
    },

    "test colorToArray": function () {
      assert.equals(util.colorToArray([1,2,3,0.5]), [1,2,3,0.5]);
      assert.equals(util.colorToArray("#ac3d4f"), [172, 61, 79, 1]);
      assert.equals(util.colorToArray("#d4faf480"), [212, 250, 244, 0.5]);

      assert.equals(util.colorToArray("rgb(212, 250,244, 0.2)"), [212, 250, 244, 0.2]);
      assert.equals(util.colorToArray("rgba(212, 150,244, 0.8)"), [212, 150, 244, 0.8]);

      assert.equals(util.colorToArray("#ac3"), [170, 204, 51, 1]);
    },
  });
});

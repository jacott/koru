define(function (require, exports, module) {
  var test, v;
  var geddon = require('bart/test');
  var Random = require('./random');

  geddon.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test sequnce": function () {
      var random = Random.create(0);
      assert.same(random.id(), "cp9hWvhg8GSvuZ9os");
      assert.same(random.id(), "3f3k6Xo7rrHCifQhR");
      assert.same(random.id(), "shxDnjWWmnKPEoLhM");
      assert.same(random.id(), "6QTjB8C5SEqhmz4ni");
    },

    "test format": function () {
      var idLen = 17;
      assert.same(Random.id().length, idLen);
      var numDigits = 9;
      var hexStr = Random.hexString(numDigits);
      assert.same(hexStr.length, numDigits);
      parseInt(hexStr, 16); // should not throw
      var frac = Random.fraction();
      assert.isTrue(frac < 1.0);
      assert.isTrue(frac >= 0.0);
    },
  });
});

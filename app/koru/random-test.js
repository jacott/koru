define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var Random = require('./random');
  var util = require('./util');

  TH.testCase(module, {
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

    "test threadSeed": function () {
      Random.id();
      var prop = Object.getOwnPropertyDescriptor(util, 'thread');
      test.onEnd(function () {
        Object.defineProperty(util, 'thread', prop);
      });
      v.thread = {};
      Object.defineProperty(util, 'thread', {configurable: true, get: function() {return v.thread}});
      Random.threadSeed(0);
      assert.same(Random.id(), "cp9hWvhg8GSvuZ9os");
      var r1 = v.thread._randomId;
      Random.threadSeed(0);
      assert.same(Random.id(), "cp9hWvhg8GSvuZ9os");
      assert.same(Random.id(), "3f3k6Xo7rrHCifQhR");
      v.thread._randomId = r1;
      assert.same(Random.id(), "3f3k6Xo7rrHCifQhR");

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

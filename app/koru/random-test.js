define(function (require, exports, module) {
  const util   = require('koru/util');
  const TH     = require('./test');

  const Random = require('./random');
  var test, v;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test sequnce"() {
      const random = Random.create(0);
      assert.same(random.id(), "cp9hWvhg8GSvuZ9os");
      assert.same(random.id(), "3f3k6Xo7rrHCifQhR");
      assert.same(random.id(), "shxDnjWWmnKPEoLhM");
      assert.same(random.id(), "6QTjB8C5SEqhmz4ni");
    },

    "test format"() {
      const randSpy = isServer ? test.spy(requirejs.nodeRequire('crypto'), 'randomBytes')
              : test.spy(window.crypto, 'getRandomValues');
      const idLen = 17;
      const id = Random.id();
      assert.same(id.length, idLen);
      assert.match(id, /^[2-9a-zA-Z]*$/);


      if (isServer) {
        assert.calledWith(randSpy, 17);
      } else {
        assert.calledWith(randSpy, TH.match(
          u8 => u8.constructor === Uint8Array && u8.length === 17));
      }

      randSpy.reset();

      const numDigits = 9;
      const hexStr = Random.hexString(numDigits);

      if (isServer) {
        assert.calledWith(randSpy, 5);
        v.u8 = randSpy.firstCall.returnValue;
      } else {
        assert.calledWith(randSpy, TH.match(u8 => v.u8 = u8));
      }
      assert.equals(util.twoDigits(v.u8[2].toString(16)), hexStr.substring(4, 6));

      assert.same(hexStr.length, numDigits);
      parseInt(hexStr, 16); // should not throw
      const frac = Random.fraction();
      assert.isTrue(frac < 1.0);
      assert.isTrue(frac >= 0.0);
    },
  });
});

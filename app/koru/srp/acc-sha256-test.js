define(function (require, exports, module) {
  const TH   = require('koru/test');

  const sut  = require('./acc-sha256');

  TH.testCase(module, {
    "test accumulation"() {
      /**
       * This is useful for building a hash in small increments; it is not the same as hashing the
       * entire string in one go.
       **/
      const h = [1,2,3,4,5,6,7,8];
      assert.same(sut.add('hello world', h), h);

      assert.same(sut.toHex(sut.add('\na bit more text\n\x01\xf7\x00\n\n\n', h)),
                  '4cb301ea6c1e975ad8130be3e660b5a9ccf9e28e514a73c63533f2690c866255');
      sut.add("363", h);
      assert.same(sut.toHex(sut.add('Ჾ蠇', h)),
                  'f8165b4e4696d5f09d0a08ed60f3503b9f4b15bf5bec95ad1fd7c85a43b00ead');
    },

  });
});

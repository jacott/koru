define(function (require, exports, module) {
  /**
   * This is useful for building a hash in small increments; it is not the same as hashing the
   * entire string in one go.
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const sut  = require('./acc-sha256');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("add", ()=>{
      /**
       * Modify `hash` using `text`.
       *
       * @param text The message to add to `hash`
       *
       * @param hash should be an array of 8 32bit integers. The default is a good set.
       *
       * @return the modified `hash`; not a copy.
       **/
      api.method();
      //[
      const h = [1,2,3,4,5,6,7,8];
      assert.same(sut.add('hello world', h), h);
      assert.equals(
        h,
        [4138495084, 3973010320, 2777164054, 2207796612,
         615005229, 3241153105, 1397076350, 2212452408]);

      assert.equals(
        sut.add('secret'),
        [5028449619, 6360507363, 2345861985, 2860865158,
         3185633997, 6197280502, 2724194683, 4113015387]);
      //]
    });

    test("toHex", ()=>{
      /**
       * Convert a `hash` to a hex string.
       *
       * @param hash an array of 32bit integers. Usually produced from {#.add}.
       *
       * @return the hex equivalent of the `hash`
       **/
      api.method();
      const h = [1,2,3,4,5,6,7,8];
      assert.same(sut.toHex([65535,1,15,256,0xffffffff,10]),
                  '0000ffff000000010000000f00000100ffffffff0000000a'),

      sut.add('hello world', h);

      assert.same(sut.toHex(sut.add('\na bit more text\n\x01\xf7\x00\n\n\n', h)),
                  '4cb301ea6c1e975ad8130be3e660b5a9ccf9e28e514a73c63533f2690c866255');

      api.done();
      sut.add("363", h);
      assert.same(sut.toHex(sut.add('Ჾ蠇', h)),
                  'f8165b4e4696d5f09d0a08ed60f3503b9f4b15bf5bec95ad1fd7c85a43b00ead');
    });
  });
});

define((require, exports, module) => {
  'use strict';
  /**
   * This is useful for building a hash in small increments; it is not the same as hashing the
   * entire string in one go.
   */
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const sut = require('./acc-sha256');

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    test('add', () => {
      /**
       * Modify `hash` using `text`.
       *
       * @param text The message to add to `hash`
       *
       * @param hash should be an array of 8 32bit integers. The default is the standard sha256
       * initial hash values.
       *
       * @return the modified `hash`; not a copy.
       */
      api.method();
      //[
      const h = [1, 2, 3, 4, 5, 6, 7, 8];
      assert.same(sut.add('hello world', h), h);
      assert.equals(h, [4138495084, 3973010320, 2777164054, 2207796612, 615005229, 3241153105, 1397076350, 2212452408]);

      assert.equals(sut.add('secret'), [
        733482323,
        2065540067,
        2345861985,
        2860865158,
        3185633997,
        1902313206,
        2724194683,
        4113015387,
      ]);
      //]
    });

    test('toId', () => {
      /**
       * Convert a string into an id hash
       */
      api.method();
      //[
      assert.same(sut.toId('hello' + 'goodbye'), 'hef112kz6HMarjX36');
      assert.same(sut.toId(''), '5aQFks5seW4uAZNtG');
      assert.same(sut.toId('1'), 'RSaJD5Q8g5Jxp2s8M');

      assert.same(sut.toId('hello'), '1fUIeDQxGXKCyEZbu');
      //]
      const u8 = new Uint8Array([255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      assert.same(sut.toId(u8), 'HL7iBaOFoWMgDI3fK');
      assert.same(sut.toId(new Uint32Array(u8.buffer)), 'HL7iBaOFoWMgDI3fK');
    });

    test('toHex', () => {
      /**
       * Convert a `hash` to a hex string.
       *
       * @param hash an array of 32bit integers. Usually produced from {#.add}.
       *
       * @return the hex equivalent of the `hash`
       */
      assert.same(
        sut.toHex(sut.add('hellogoodbye')),
        '3e4dc8cb9fce3f3e0aea6905faf58fd5baba4981c4f043ae03f58ef6a331de2f',
      );
      assert.same(sut.toHex(sut.add('')), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      assert.same(sut.toHex(sut.add('1')), '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b');

      api.method();
      //[
      assert.same(
        sut.toHex([65535, 1, 15, 256, 0xffffffff, 10, 0, 0]),
        '0000ffff000000010000000f00000100ffffffff0000000a0000000000000000',
      );

      const h = [1, 2, 3, 4, 5, 6, 7, 8];
      sut.add('hello world', h);
      assert.same(sut.toHex(h), 'f6ac6c6ceccf5390a588291683984d8424a83c2dc13012515345b17e83df5838');

      assert.same(
        sut.toHex(sut.add('\na bit more text\n\u{1}÷\0\n\n\n', h)),
        '4cb301ea6c1e975ad8130be3e660b5a9ccf9e28e514a73c63533f2690c866255',
      );
      //]
      api.done();
      sut.add('363', h);
      assert.same(sut.toHex(sut.add('Ჾ蠇', h)), 'f8165b4e4696d5f09d0a08ed60f3503b9f4b15bf5bec95ad1fd7c85a43b00ead');

      let long = new Array(29 + 1).join('1234567890');

      assert.same(sut.toHex(sut.add(long, h)), '142513117c582aaca7a37386caada53880bf6b2e93be5b7fb6abf6e6c8ba504d');
    });
  });
});

define(function (require, exports, module) {
  const TH              = require('./test');

  const sut = require('./text-encoder');

  TH.testCase(module, {
    "test utf16to8"() {
      const buf = [1, 2];
      sut.utf16to8(buf, '\na bit more Ჾ蠇 text\n\x01\xf7\x00\n\n\n');
      assert.equals(buf, [
        1, 2, 10, 97, 32, 98, 105, 116, 32, 109, 111, 114, 101, 32,
        225, 178, 190, 232, 160, 135, 32, 116, 101, 120, 116,
        10, 1, 195, 183, 0, 10, 10, 10]);
    },

    "test surrogate characters"() {
      const utf8 = [104, 240, 159, 146, 163, 195, 169, 195, 191, 226, 130, 172];
      const buf = [];
      sut.utf16to8(buf, 'h💣é\xff\u20AC');
      assert.equals(buf, utf8);

      assert.equals(sut.utf8to16(new Uint8Array(utf8)), ['h💣é\xff\u20AC', 12]);
    },


    "test utf8to16"() {
      const buf = new Uint8Array([
        10, 97, 32, 98, 105, 116, 32, 109, 111, 114, 101, 32,
        225, 178, 190, 232, 160, 135, 32, 116, 101, 120, 116,
        10, 1, 195, 183, 0, 10, 10, 10,
        0xff, 1, 2, 3]);

      const [out, i] = sut.utf8to16(buf);
      assert.equals(out, '\na bit more Ჾ蠇 text\n\x01\xf7\x00\n\n\n');
      assert.equals(i, 32);
    },

    "test passing start and end to utf8to16"() {
      const buf = new (isServer ? Buffer : Uint8Array)([
        11, 12, 13, 10, 97, 32, 98, 105, 116, 32, 109, 111, 114, 101, 32,
        225, 178, 190, 232, 160, 135, 32, 116, 101, 120, 116,
        10, 1, 195, 183, 0, 10, 10, 10,
        10, 1, 2, 3]);

      const [out, i] = sut.utf8to16(buf, 3, 27);
      assert.equals(out, '\na bit more Ჾ蠇 text\n');
      assert.equals(i, 27);
    },
  });
});

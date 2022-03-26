define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test-helper');

  const sha256 = require('./sha256');

  TH.testCase(module, ({test}) => {
    test('hash', () => {
      assert.same(sha256(new Uint8Array([255, 0, 1, 2, 3, 4])),
                  'ee6cdd6a87beb142e5ddabf29f5657241758344a4bb7c57925fa975629319971');

      assert.same(sha256('hello world'),
                  'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');

      assert.same(sha256('\na bit more text\n\x01\xf7\x00\n\n\n'),
                  'd777fb0c8845ba0c63e09e481dc447b277192cc10568abd9b8b1b13e217cc7ca');
      assert.same(sha256('363'), 'a43231c2216f23db8d65bbd57e0ce6573654f9a102365cd4b345723f1437ab2b');
      assert.same(sha256('Ჾ蠇'), '0a59587e1187230d1dabb11ca4b6461f79776951d02744bc573d642254d1703e');
    });
  });
});

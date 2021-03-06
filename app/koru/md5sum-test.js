define((require, exports, module)=>{
  'use strict';
  const Random          = require('koru/random');
  const TH              = require('koru/test-helper');

  const md5sum = require('./md5sum');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("md5sum", ()=>{
      assert.same(md5sum("hello world"), '5eb63bbbe01eeed093cb22bb8f5acdc3');
      assert.same(md5sum('\na bit more text\n\x01\xf7\x00\n\n\n'),
                  'ad4c3151dc2e6caba9f7bc92f79c8b08');
      assert.same(md5sum("363"), '00411460f7c92d2124a67ea0f4cb5f85');
      assert.same(md5sum('Ჾ蠇'), '000000005e0a51c8313ffb438a3a2861');
    });
  });
});

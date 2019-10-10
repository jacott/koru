define((require, exports, module)=>{
  'use strict';
  const TH              = require('koru/test-helper');

  const {stub, spy, util} = TH;

  const pbkdf2 = require('./pbkdf2');

  const hex = ary =>{
    let hex = '';
    for(let i = 0; i < ary.length; ++i) {
      const s = ary[i].toString(16);
      hex += s.length == 1 ? '0'+s : s;
    }
    return hex;
  };

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("pbkdf2", async ()=>{
      assert.equals(hex(new Uint8Array(
        await pbkdf2('secret', 'salty', 100000, 64, 'sha-512'))), '16b6d4e455498df7');
    });
  });
});

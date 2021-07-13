isServer && define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test');

  const {stub, spy, util} = TH;

  const format = require('./format');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('send', () => {
      const ws = {send: stub()};
      format(ws, null, 'foo("string");\n');
      assert.calledWith(ws.send, `IF{"source":"foo('string');\\n"}`);
    });
  });
});

define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test-helper');

  const {stub, spy, util} = TH;

  const SessionVersion = require('./session-version');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('comparePathVersion dev connect', () => {
      const sess = {};
      assert.equals(SessionVersion.comparePathVersion(sess, '/ws/7/dev/?org=demo'), 5);
    });
  });
});

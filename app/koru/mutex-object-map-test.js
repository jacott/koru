define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const TH              = require('koru/model/test-db-helper');

  const {stub, spy, util} = TH;

  const MutexObjectMap = require('./mutex-object-map');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('lock', async () => {
      const result = [];
      const a = {};
      const b = {};

      const db = new MutexObjectMap();

      let al = await db.lock(a);
      const bl2 = await db.lock(b);
      result.push('m1');

      koru.runFiber(async () => {
        result.push('s1');
        await db.lock(a);
        result.push('s2');
        bl2.unlock();
      });

      await 1;
      await 1;
      al.unlock();
      let bl = await db.lock(b);
      result.push('m2');
      bl.unlock();

      assert.equals(result, ['m1', 's1', 's2', 'm2']);
    });
  });
});

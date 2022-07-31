define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const TH              = require('koru/test-helper');
  const MockPromise     = require('koru/test/mock-promise');

  const {stub, spy, util} = TH;

  const SimpleMutex = require('./simple-mutex');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('multiple waiting', async () => {
      const order = [];
      const addMe = (msg) => {
        order.push(msg);
        return msg;
      };

      const mutex = new SimpleMutex();
      const l1 = mutex.lock();
      const l2 = mutex.lock().then(addMe);
      const l3 = mutex.lock().then(addMe);

      mutex.unlock('l1:ul');

      assert.same(l1, void 0);
      assert.isPromise(l2);
      assert.isPromise(l3);

      assert.same(await l2, 'l1:ul');
      addMe('l2:locked');

      const l4 = mutex.lock().then(addMe);

      mutex.unlock('l2:ul');

      l3.then(() => {mutex.unlock('l3:ul'); l4.then(() => {mutex.unlock('l4:ul')})});

      assert.same(await l3, 'l2:ul');
      addMe('l3:locked');

      let l6 = null;

      await mutex.lock().then((msg) => {addMe(msg); mutex.unlock('l5'); addMe(l6 = mutex.lock())});

      assert.same(l6, void 0);

      mutex.unlock('end');

      assert.equals(order, ['l1:ul', 'l2:locked', 'l2:ul', 'l3:locked', 'l3:ul', 'l4:ul', undefined]);
    });
  });
});

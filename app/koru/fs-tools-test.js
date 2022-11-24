isServer && define((require, exports, module) => {
  'use strict';
  /**
   * Convenience wrapper around some node `fs` functions
   */
  const Future          = require('koru/future');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const fsp = requirejs.nodeRequire('fs/promises');

  const {stub, spy, util} = TH;

  const fst = require('./fs-tools');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('readlinkIfExists', async () => {
      api.method();
      //[
      stub(fsp, 'readlink');
      fsp.readlink.withArgs('idontexist').invokes(async (c) => {throw {code: 'ENOENT'}});
      fsp.readlink.withArgs('accessdenied').invokes(async (c) => {throw {code: 'EACCESS'}});
      fsp.readlink.withArgs('iamasymlink').returns(Promise.resolve('pointinghere'));

      assert.same(await fst.readlinkIfExists('idontexist'), undefined);
      assert.same(await fst.readlinkIfExists('iamasymlink'), 'pointinghere');
      await assert.exception(() => fst.readlinkIfExists('accessdenied'), {code: 'EACCESS'});
      //]
    });

    test('appendData', async () => {
      api.method();
      const f1 = new Future();
      const f2 = new Future();
      const fh = {
        async write(...args) {
          const action = await f1.promiseAndReset();
          f2.resolve(['write', args]);
          if (typeof action === 'string') {
            return action;
          } else {
            throw action;
          }
        },
        async close() {
          f2.resolve('close ' + await f1.promiseAndReset());
        },
      };
      stub(fsp, 'open').invokes(async (c) => {
        const fh = await f1.promiseAndReset();
        f2.resolve(c.args);
        return fh;
      });

      //[
      const ans = fst.appendData('/my/file.txt', 'extra data');
      //]
      let done = false;
      ans.then((ans) => (done = true, ans));

      f1.resolve(fh);
      assert.equals(await f2.promiseAndReset(), ['/my/file.txt', 'a', 420]);
      f1.resolve('success');
      assert.equals(await f2.promiseAndReset(), ['write', ['extra data']]);
      f1.resolve('done');
      await 1;
      assert.isFalse(done);
      assert.equals(await f2.promiseAndReset(), 'close done');
      assert.same(await ans, 'success');
      assert.isTrue(done);
    });
  });
});

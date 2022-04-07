isServer && define((require, exports, module) => {
  'use strict';
  /**
   * Convenience wrapper around some node `fs` functions
   */
  const TH              = require('koru/model/test-db-helper');
  const api             = require('koru/test/api');

  const fsp = requirejs.nodeRequire('fs/promises');

  const {stub, spy, util} = TH;

  const fst = require('./fs-tools');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    beforeEach(() => TH.startTransaction());
    afterEach(() => TH.rollbackTransaction());

    test('readlinkIfExists', async () => {
      api.method();
      //[
      stub(fsp, 'readlink');
      fsp.readlink.withArgs('idontexist').invokes(async (c) => {throw {code: 'ENOENT'}});
      fsp.readlink.withArgs('accessdenied').invokes(async (c) => {throw {code: 'EACCESS'}});
      fsp.readlink.withArgs('iamasymlink').returns(Promise.resolve('pointinghere'));

      assert.same(await fst.readlinkIfExists('idontexist'), void 0);
      assert.same(await fst.readlinkIfExists('iamasymlink'), 'pointinghere');
      await assert.exception(() => fst.readlinkIfExists('accessdenied'), {code: 'EACCESS'});
      //]
    });
  });
});

isServer && define((require, exports, module) => {
  'use strict';
  const fst             = require('koru/fs-tools');
  const Future          = require('koru/future');
  const TH              = require('koru/test');
  const api             = require('koru/test/api');
  const fsp             = requirejs.nodeRequire('fs/promises');
  const path            = requirejs.nodeRequire('path');

  const {stub, spy, util, match: m} = TH;

  const DirWatcher = require('./dir-watcher');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('constructor', async () => {
      /**
       * Watch recursively for file and directory changes

       * @param dir the top level directory to watch
       * @param callback called with the path that changed and a `fs.Stats` object or `undefined` if
       * @param callOnInit if true run the callback for every existing path found.
       * unlinked.
       */
      const DirWatcher = api.class();
      const testDir = path.resolve(module._dir + '/.build/test-watch-dir');
      await fst.rm_rf(testDir);

      const liveDir = path.resolve(testDir + '/live');
      await fst.mkdir_p(liveDir + '/d1');
      await fsp.writeFile(liveDir + '/d1/f1', '123');

      let future = new Future();
      const {thread} = util;

      //[
      const callback = stub((pathname, st) => {
        if (path.basename(pathname) === 'f1') {
          future.resolve();
        }
      });
      after(new DirWatcher(liveDir, callback, true));

      await future.promise;
      assert.calledTwice(callback);
      assert.calledWith(callback, m(/^\/.*\.build\/test-watch-dir\/live\/d1$/), m((st) => st.isDirectory()));
      assert.calledWith(callback, m(/test-watch-dir.*f1$/), m((st) => ! st.isDirectory()));
      //]

      callback.reset(); future = new Future();

      await fst.mkdir_p(testDir + '/archive');
      await fsp.link(liveDir + '/d1/f1', testDir + '/archive/f2');

      await fsp.unlink(liveDir + '/d1/f1');

      await future.promise;

      assert.calledWith(callback, m(/d1\/f1/), void 0);

      callback.reset(); future = new Future();

      await fsp.symlink(testDir + '/archive/f2', testDir + '/live/d1/f1');

      await future.promise;

      assert.calledWith(callback, m(/d1\/f1/), m((st) => st.isFile() && ! st.isSymbolicLink()));
    });
  });
});

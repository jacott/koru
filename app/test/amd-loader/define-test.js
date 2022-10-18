define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test');

  const {stub, spy, util, match: m} = TH;

  const Module = module.constructor;

  const {ctx} = module;
  const baseUrl = ctx.baseUrl + 'test/amd-loader/';

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let myCtx;
    let defineDepsFirst, defineNoDeps, defineObject, dep1, TestUnload, myMod;
    let oldCtx = Module.currentCtx;
    before(() => {
      myCtx = new ctx.constructor({context: 'my ctx', baseUrl});
      globalThis.testCtx = myCtx;
      Module.currentCtx = myCtx;
      return new Promise((resolve, reject) => {
        myCtx.require([
          './test-data/define-deps-first',
          './test-data/define-no-deps',
          './test-data/define-object',
          './test-data/subdir/dep1',
          './test-data/test-unload'], (...args) => {
            [defineDepsFirst, defineNoDeps, defineObject, dep1, TestUnload] = args;
            resolve();
          }, reject);
        myMod = new Module(myCtx, 'define-test');
      });
    });

    after(() => {
      Module.currentCtx = oldCtx;
      globalThis.testCtx = undefined;
    });

    test('can look for an existing module', () => {
      const mod = myMod.get('./test-data/define-no-deps');
      assert.same(mod.id, 'test-data/define-no-deps');
      assert.same(myMod.get('fuz'), undefined);
    });

    test('should allow named define calls', () => {
      after(() => {
        myMod.get('foo')?.unload();
        myMod.get('bar')?.unload();
      });
      define('foo', ['test-data/define-object', 'module'], function (defObj, module) {
        module.exports = () => {
          return defObj;
        };
      });
      define('bar', () => {
        return 'bar def';
      });
      const {foo} = myCtx.modules;
      assert(foo);
      assert.same(foo.exports, myCtx.require('fo' + 'o'));
      assert.isFunction(foo.exports);
      assert.equals(foo.exports(), defineObject);
      assert.same(myCtx.require('ba' + 'r'), 'bar def');
    });

    test('can load named defines', (done) => {
      myCtx.require('test-data/named-define', (res) => {
        try {
          assert.same(res, 'named success');
          done();
        } catch (ex) {
          done(ex);
        }
      }, done);
    });

    test('should set amd attribute', () => {
      assert.equals(define.amd, {});
    });

    test('should not inspect body if no arguments', () => {
      const fn = new Function('req' + "uire('fuz');");
      define(fn);
      const gdr = Module._globalDefineResult;
      assert.equals(gdr, [null, undefined, fn, undefined]);
    });

    test('should detect ids not normalizing within baseUrl', () => {
      assert.exception(() => {
        myMod.normalizeId('../test/dep2');
      }, {message: m(/does not resolve/)});
    });

    test('should allow define object', () => {
      assert.equals(defineObject, {simple: 'object'});
    });

    test('should allow allow function without dependencies', () => {
      assert.same(defineNoDeps, 'success');
    });

    test('should (un)load nested dependencies', (done) => {
      assert.isFunction(dep1);
      assert.isTrue(dep1());
      const dep1Mod = myCtx.modules[myMod.normalizeId('./test-data/subdir/dep1')];
      const dep2Mod = myCtx.modules[myMod.normalizeId('./test-data/dep2')];
      refute(dep1.testUnload);
      let unloadCount = 2;
      dep1Mod.onUnload(() => {
        if (unloadCount == 1) unloadCount = 0;
      });
      dep2Mod.onUnload(() => {
        if (unloadCount == 2) {
          unloadCount = 1;
        }
      });
      dep2Mod.unload();
      // ensure unload callbacks for suppliers happen before consumers
      assert.same(unloadCount, 0);
      assert.same(dep1.testUnload, true);
      myCtx.require('test-data/subdir/dep1', function (obj) {
        try {
          assert.same(obj(), true);
          assert.same(obj(), false);
          done();
        } catch (ex) {
          done(ex);
        }
      });
    });

    test('should call all unloads', () => {
      assert.same(TestUnload.unloadCount, 2);
      TestUnload.module.unload();
      assert.same(TestUnload.unloadCount, 0);
    });

    test('should allow dependencies as first argument', () => {
      assert.equals(defineDepsFirst, {success: true});
    });
  });
});

define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test');
  const modBuilder      = require('./test-data/mod-builder');

  const {stub, spy, util, match: m} = TH;

  const Module = module.constructor;

  const {ctx} = module;
  const baseUrl = ctx.baseUrl + 'test/amd-loader/';

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let myCtx;
    let oldCtx = Module.currentCtx;
    let mods, v;
    let prepare, depGraph;

    beforeEach(() => {
      myCtx = new ctx.constructor({context: 'my ctx', baseUrl});
      Module.currentCtx = myCtx;
      v = {};
      mods = myCtx.modules;
      const mb = modBuilder(myCtx, v);
      depGraph = mb.depGraph;
      prepare = mb.prepare;
    });

    afterEach(() => {
      ctx.constructor.remove('my ctx');
      Module.currentCtx = oldCtx;
    });

    test('should depend on a ready module', () => {
      depGraph('3d2');

      mods.m2._ready();

      depGraph('1d2');

      assert.same(mods.m1.state, Module.READY);
      assert.same(mods.m3.state, Module.READY);

      assert.equals(mods.m2._requiredBy, {m3: 1, m1: 1});
    });

    test('should unload correctly', () => {
      depGraph('1d2,6,7,10 2d4,3 3d4,5 4d3');

      depGraph('8d9,10');

      prepare(mods.m6);

      myCtx.onError = (err) => {};
      mods.m5._error('foo');

      assert.same(myCtx.resolvingCount, 3);
      assert.same(myCtx.depCount, 2);
      assert.equals(mods.m6._requiredBy, {});
      assert.equals(Object.keys(myCtx.waitReady), ['m8']);
    });

    test('will throw exception if enforceAcyclic', () => {
      myCtx.config({enforceAcyclic: true});

      try {
        depGraph('1d2 2d1');
      } catch (ex) {
        assert.same(ex.message, 'Module: m2 - Cycle detected to m1');
        return;
      }
      assert.fail('should have thrown exception');
    });

    test('can add a dependency to a module', () => {
      depGraph('1');
      const mod = mods.m1;
      mod.dependOn('flux');
      assert.same(mods.flux._requiredBy.m1, 1);
      assert.same(mod._requires.flux, 1);
      refute(mod._requires['data/dep2']);
      mod.dependOn('./data/dep2');
      assert.same(mod._requires['data/dep2'], 1);
      assert.same(mods['data/dep2']._requiredBy.m1, 1);
    });

    test('will call onError if enforceAcyclic', () => {
      myCtx.config({enforceAcyclic: true});
      myCtx.onError = function (arg1, arg2, arg3, arg4) {v.args = [arg1, arg2, arg3]}

      depGraph('1d2 2d3 3d1');

      assert.same(v.args[0].message, 'Module: m3 - Cycle detected to m1');
      assert.same(v.args[1].id, 'm3');
      assert.same(v.args[2], mods.m1);
    });

    test('should wait for _requiredBy', () => {
      const _requires = depGraph('1d2');
      assert.same(myCtx.resolvingCount, 1);

      depGraph('3d2,4');
      assert.same(myCtx.resolvingCount, 2);
      assert.same(mods.m3.depCount, 2);
      assert.same(myCtx.depCount, 3);

      prepare(mods.m2);
      assert.same(myCtx.resolvingCount, 1);
      assert.equals(mods.m2._requiredBy, {m1: 1, m3: 1});
      assert.same(mods.m3.depCount, 1);
      assert.equals(mods.m4._requiredBy, {m3: 1});
      assert.same(v.callback, 'result_m1');
      assert.same(myCtx.depCount, 1);

      prepare(mods.m4);
      assert.same(mods.m3.depCount, 0);
      assert.same(myCtx.depCount, 0);
      assert.same(myCtx.resolvingCount, 0);
      assert.same(v.callback, 'result_m3');
    });

    test('should handle error with cycle', () => {
      const _requires = depGraph('2d3 3d4,5 4d2,5');
      mods.m4.onError = [(err, m5) => {v.err4 = err}];
      mods.m2.onError = [(err, m) => {v.err2 = m.id; mods.m5.state = Module.LOADING}];

      mods.m5._error('foo');
      assert.same(v.err2, 'm2');
      assert.same(v.err4, 'foo');
    });

    test('breaks cycle iff no module loading', () => {
      ++myCtx.loadingCount;
      depGraph('1d2 2d1');
      Module.breakCycle(myCtx);
      assert.same(myCtx.depCount, 2);
      --myCtx.loadingCount;
      Module.breakCycle(myCtx);
      assert.same(myCtx.depCount, 0);
    });

    test('should break cycle', () => {
      const _requires = depGraph('1d2 2d4,3 3d4,5 4d3');
      assert.same(myCtx.resolvingCount, 1);
      assert.same(myCtx.depCount, 6);
      assert.same(v.callback, undefined);
      prepare(mods.m5);
      assert.same(v.callback, 'result_m1');
      assert.equals(v.results, {
        m5: [],
        m3: [undefined, 'result_m5'],
        m4: ['result_m3'],
        m2: ['result_m4', 'result_m3'],
        m1: ['result_m2']});
      assert.equals(mods.m4._requiredBy, {m2: 1, m3: 0});
    });

    test('should allow modules without a context', () => {
      const mod = new Module(undefined, 'my/module');
      assert.same(mod.id, 'my/module');
      assert.same(mod.ctx, undefined);
    });
  });
});

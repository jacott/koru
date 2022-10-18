define((require, exports, module) => {
  'use strict';
  /**
   * Helper utility for traversing module graphs
   **/
  const TH              = require('koru/test');
  const modBuilder      = require('./test-data/mod-builder');
  const graph           = require('test/amd-loader/graph');

  const {stub, spy, util, match: m} = TH;

  const Module = module.constructor;
  const Context = module.ctx.constructor;

  const modules = module.ctx.modules;
  const {ctx} = module;
  const baseUrl = ctx.baseUrl + 'test/amd-loader/';

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let myCtx, myMod;
    let depGraph;
    let mods;
    let oldCtx = Module.currentCtx;

    beforeEach(() => {
      myCtx = new ctx.constructor({context: 'my ctx', baseUrl});
      myMod = new Module(myCtx, 'define-test');
      Module.currentCtx = myCtx;
      mods = myCtx.modules;
      depGraph = modBuilder(myCtx, {}).depGraph;
    });

    afterEach(() => {
      ctx.constructor.remove('my ctx');
      Module.currentCtx = oldCtx;
    });

    group('findPath', () => {
      /**
       * Finds shortest dependency path from one module to another
       * module that it (indirectly) requires.
       *
       * @param start the module to start from
       * @param goal the module to look for
       * @returns {Array} from `start` to `goal`
       **/
      test('can find direct path', () => {
        const ans = graph.findPath(module, modules['test/amd-loader/graph']).map((m) => m.id.replace('test/amd-loader/', ''));
        assert.equals(ans, ['graph-test', 'graph']);
      });

      test('can find simple direct path', () => {
        depGraph('1d2 2d3');
        const ans = graph.findPath(mods.m1, mods.m3).map((m) => m.id);
        assert.equals(ans, ['m1', 'm2', 'm3']);
      });

      test('can find shortest path', () => {
        depGraph('1d2,3,4 3d4 4d8 5d6,7 8d7');
        mods.m1._requires[''] = 1;
        const ans = graph.findPath(mods.m1, mods.m7).map((m) => m.id);
        assert.equals(ans, ['m1', 'm4', 'm8', 'm7']);
      });

      test("can't find path", () => {
        depGraph('1d2,3 2d3');

        assert.same(graph.findPath(mods.m2, mods.m1), undefined);
        assert.same(graph.findPath(mods.m3, mods.m2), undefined);
      });
    });

    group('isRequiredBy', () => {
      /**
       * Test if `supplier` is required by `user`.
       *
       * @param supplier the module to look for
       * @param user the module to start from
       * @returns {boolean} true if path found from user to supplier
       **/

      test('can find direct path', () => {
        assert.same(graph.isRequiredBy(modules['test/amd-loader/graph'], module), true);
        assert.same(graph.isRequiredBy(module, modules['test/amd-loader/graph']), false);
      });

      test('can find shortest path', () => {
        depGraph('1d2,3,4 3d4 4d8 5d6,7 8d7');
        mods.m1._requires[''] = 1;
        assert.same(graph.isRequiredBy(mods.m7, mods.m1), true);
      });

      test("can't find path", () => {
        depGraph('1d2,3 2d3');

        assert.same(graph.isRequiredBy(mods.m1, mods.m2), false);
        assert.same(graph.isRequiredBy(mods.m2, mods.m3), false);
      });
    });
  });
});

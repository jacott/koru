define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test');

  const {stub, spy, util, match: m} = TH;

  const Module = module.constructor;
  const Context = module.ctx.constructor;

  const {ctx} = module;
  const baseUrl = ctx.baseUrl + 'test/amd-loader/';

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let myCtx;
    let oldCtx = Module.currentCtx;
    beforeEach(() => {
      myCtx = new ctx.constructor({context: 'my ctx', baseUrl});
      Module.currentCtx = myCtx;
    });

    afterEach(() => {
      ctx.constructor.remove('my ctx');
      Module.currentCtx = oldCtx;
    });

    test('should call _onConfig after changing settings', () => {
      const orig = Context._onConfig;
      let called, baseUrl;

      after(() => {Context._onConfig = orig});

      Context._onConfig = (ctx) => {
        baseUrl = ctx.baseUrl;
        called = true;
      };
      myCtx.config({baseUrl: 'foo'});
      assert.same(called, true);
      assert.same(baseUrl, 'foo/');
    });

    test('should set paths', () => {
      myCtx.config({
        paths: {
          foobar: 'data/subdir',
          'multi/part/id': 'here',
          multi: 'there',
        },
      });

      assert.equals(myCtx.paths, {
        foobar: {
          '/location': 'data/subdir',
        },
        multi: {
          '/location': 'there',
          part: {
            id: {
              '/location': 'here',
            },
          },
        },
      });
    });
  });
});

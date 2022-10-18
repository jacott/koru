define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test');

  const {stub, spy, util, match: m} = TH;

  const Module = module.constructor;

  const {ctx} = module;
  const baseUrl = ctx.baseUrl + 'test/amd-loader/';

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let myCtx;
    let oldCtx = Module.currentCtx;
    before(() => {
      myCtx = new ctx.constructor({context: 'my ctx', baseUrl});
      Module.currentCtx = myCtx;
    });

    after(() => {
      ctx.constructor.remove('my ctx');
      Module.currentCtx = oldCtx;
    });

    test('uses normalizeId by default', (done) => {
      myCtx.require('test-data/simple-plugin!./flux', (simple) => {
        try {
          assert.same(simple, 'simple flux');
          done();
        } catch (ex) {
          done(ex);
        }
      });
    });

    test('handles onload.error', (done) => {
      myCtx.require('test-data/error-plugin!foo', () => {
        done(new Error('unexpected'));
      }, (error) => {
        try {
          assert.same(error.message, 'Module: test-data/error-plugin!foo - foo');
          setTimeout(() => {
            try {
              assert.same(myCtx.modules['test-data/error-plugin!foo'], undefined);
              done();
            } catch (ex) {
              done(ex);
            }
          }, 0);
        } catch (ex) {
          done(ex);
        }
      });
    });

    test('recovers from load error', (done) => {
      const onError = myCtx.onError;
      myCtx.onError = (v) => {
        setTimeout(() => {
          try {
            assert.same(v.module.id, 'test-data/syntax-error');
            assert.same(myCtx.depCount, 0);
            assert.same(myCtx.resolvingCount, 0);
            done();
          } catch (ex) {
            done(ex);
          }
        }, 0);
      };
      myCtx.require('test-data/plugin-load-error', () => {
        assert.fail('should not get here');
      });
    });

    test('can double require a plugin', (done) => {
      let count = 2;
      const assertOk = (result) => {
        try {
          assert.same(result, 'simple foo');
          --count || done();
        } catch (ex) {
          done(ex);
        }
      };

      myCtx.require('test-data/simple-plugin!foo', assertOk);

      myCtx.require('test-data/simple-plugin!foo', assertOk);
    });

    test('maps un-normalized correctly', () => {
      const pmod = new Module(myCtx, 'foo');
      const caller = new Module(myCtx, 'baz');
      let loadCount = 0;
      pmod.exports = {load(name, req, onLoad) {
        ++loadCount;
      }};
      const plugin = new Module.Plugin(pmod);
      const myMod = plugin.fetch('./unnorm', caller);
      const myMod2 = plugin.fetch('unnorm');
      assert.same(myCtx.resolvingCount, 4);
      assert.same(myMod.id, '');
      assert.same(plugin.waiting['baz']['./unnorm'][0], caller);
      assert.same(plugin.waiting['baz']['./unnorm'][1], myMod);
      assert.same(plugin.waiting['']['unnorm'][0], undefined);
      assert.same(plugin.waiting['']['unnorm'][1], myMod2);

      plugin.ready();

      assert.same(loadCount, 1);

      assert.same(myCtx.resolvingCount, 4);
      assert.same(myCtx.depCount, 0);
    });

    test('calls callbacks', (done) => {
      let waitCount = 2;
      myCtx.require('test-data/foo-plugin!junk/here/fuzz', (fuzz) => {
        try {
          assert.same(fuzz, 'hello fuzz');
          --waitCount || done();
        } catch (ex) {
          done(ex);
        }
      }, done);

      myCtx.require('test-data/foo-plugin', (plugin) => {
        const oCtx = Module.currentCtx;
        try {
          Module.currentCtx = myCtx;
          define('foo5', ['test-data/foo-plugin!fuzz'], (fuzz1) => {
            try {
              assert.same(fuzz1, 'hello fuzz');
              assert.same(Module.currentCtx, myCtx);
              --waitCount || done();
            } catch (ex) {
              done(ex);
            }
          });
          const fuzz = myCtx.modules['test-data/foo-plugin!fuzz'];
          fuzz.delayLoad();
        } finally {
          Module.currentCtx = oCtx;
        }
      });
    });
  });
});

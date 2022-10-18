define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test');

  const {stub, spy, util} = TH;

  const {ctx} = module;
  const baseUrl = ctx.baseUrl + 'test/amd-loader/';
  const testDataUrl = baseUrl + 'test-data';

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    afterEach(() => {
      ctx.constructor.remove('my ctx');
    });

    test('can retrieve context from require', () => {
      assert.same(ctx.config(), ctx);
    });

    test('can record module exports', () => {
      const myCtx = new ctx.constructor({
        context: 'my ctx', baseUrl: testDataUrl,
        recordExports: true,
      });

      return new Promise((resolve, reject) => {
        myCtx.require('define-object', (result) => {
          try {
            assert.equals(myCtx.exportsModule(result)[0], myCtx.modules['define-object']);
            myCtx.require('simple', (result) => {
              try {
                assert.same(myCtx.exportsModule(result), undefined);
                resolve();
              } catch (ex) {
                reject(ex);
              }
            }, resolve);
          } catch (ex) {
            reject(ex);
          }
        }, reject);
      });
    });

    test('can set baseUrl', (done) => {
      const myCtx = new ctx.constructor({context: 'my ctx', baseUrl: 'foo'});
      assert.same(myCtx.baseUrl, 'foo/');
      myCtx.config({context: 'my ctx', baseUrl: 'bar'});
      assert.same(myCtx.baseUrl, 'bar/');
      const newUrl = testDataUrl + '/subdir/';
      const myCtx2 = ctx.config({context: 'my ctx', baseUrl: newUrl});
      assert.same(myCtx2, myCtx);
      assert.same(myCtx.baseUrl, newUrl);

      myCtx.require('define-object', (result) => {
        try {
          assert.equals(result, {subdir: 'object'});
          done();
        } catch (ex) {
          done(ex);
        }
      }, done);
    });

    test('can set paths', (done) => {
      const myCtx = ctx.config({
        context: 'my ctx',
        baseUrl,
        paths: {
          defo: 'test-data/subdir',
        },
      });

      myCtx.require('defo/define-object', (result) => {
        try {
          assert.equals(result, {subdir: 'object'});
          done();
        } catch (ex) {
          done(ex);
        }
      }, done);
    });

    group('shim', () => {
      test('can set shim', (done) => {
        const myCtx = ctx.config({
          context: 'my ctx',
          baseUrl,
          shim: {
            './test-data/no-define': {
              deps: ['test-data/dep2', 'exports', 'module'],
              exports: (dep2, exports, module) => {
                return [dep2, exports, module];
              },
            },
          },
        });

        myCtx.require('test-data/no-define', (result) => {
          try {
            assert.isTrue(Array.isArray(result));
            assert.same(result[0], true);
            assert.equals(result[1], {});
            assert.same(result[2].id, 'test-data/no-define');
            done();
          } catch (ex) {
            done(ex);
          }
        }, done);
      }),

      test('does not use require for shim', (done) => {
        const myCtx = ctx.config({
          context: 'my ctx',
          baseUrl,
          shim: {
            'test-data/no-module': {},
          },
        });

        myCtx.require('test-data/no-module', (result) => {
          try {
            assert.equals(result, {module: false});
            done();
          } catch (ex) {
            done(ex);
          }
        }, done);
      });
    });

    test('should honor expectDefine', (done) => {
      const myCtx = ctx.config({
        context: 'my ctx',
        baseUrl,
        shim: {
          'test-data/no-define': {expectDefine: true},
        },
        enforceDefine: true,
      });

      myCtx.require('test-data/no-define', (result) => {
        try {
          assert.fail('should not allow define to be missing');
        } catch (ex) {
          done(ex);
        }
      }, (error, mod) => {
        const onError = mod.ctx.onError;
        mod.ctx.onError = util.voidFunc;
        setTimeout(() => {
          try {
            assert.same(error.module.id, 'test-data/no-define');
            assert.same(error.nodefine, true);
            done();
          } catch (ex) {
            done(ex);
          } finally {
            mod.ctx.onError = onError;
          }
        });
      });
    });

    test('can set config', (done) => {
      const simpleConfig = {name: 'value'};

      const myCtx = ctx.config({
        context: 'my ctx',
        baseUrl,
        config: {'./test-data/simple': simpleConfig},
      });

      myCtx.require('./test-data/simple', (result) => {
        try {
          const mod = myCtx.modules['test-data/simple'];
          assert.same(mod.config(), simpleConfig);
          done();
        } catch (ex) {
          done(ex);
        }
      }, done);
    });

    test('can set packages', (done) => {
      const myCtx = ctx.config({
        context: 'my ctx',
        baseUrl,
        paths: {subdir: 'test-data/subdir'},
        packages: [
          'subdir',
          {name: 'foo/bar', location: 'test-data', main: 'dep2'},
        ],
      });

      myCtx.require(['subdir', 'foo/bar'], (subdir, foobar) => {
        try {
          assert.equals(subdir, {value: 'main module'});
          assert.same(foobar, true);
          done();
        } catch (ex) {
          done(ex);
        }
      }, done);
    });
  });
});

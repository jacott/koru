define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test');

  const {stub, spy, util, match: m} = TH;

  const Module = module.constructor;

  const {ctx} = module;
  const baseUrl = ctx.baseUrl + 'test/amd-loader/';
  const testDataUrl = baseUrl + 'test-data';

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    afterEach(() => {
      ctx.constructor.remove('my ctx');
    });

    test('should handle circular dependancies', (done) => {
      const myCtx = new ctx.constructor({context: 'my ctx', baseUrl});
      myCtx.require('test-data/circular1', (circular1) => {
        try {
          assert.equals(circular1, {c1: true, c2: true, c3: true});
          done();
        } catch (ex) {
          done(ex);
        }
      }, done);
    });

    test('should wait for nested dependencies', (done) => {
      const myCtx = new ctx.constructor({context: 'my ctx', baseUrl});
      Module.currentCtx = myCtx;
      define('foo', function () {return 'FOO'});
      Module.currentCtx = ctx;
      var foo = myCtx.modules.foo;
      foo.state = Module.LOADED;
      --myCtx.resolvingCount;
      foo.exports = {};
      myCtx.require('test-data/dep-on-foo', function (arg) {
        try {
          assert.same(arg, 'FOO');
          done();
        } catch (ex) {
          done(ex);
        }
      }, done);
      setTimeout(function () {
        Module._prepare(foo);
      }, 10);
    });

    test('should convert id to uri', () => {
      var exp = ctx.baseUrl + 'abc/def.j.foo';
      assert.same(ctx.uri('abc/def.j', '.foo'), exp);
      assert.same(ctx.uri('/abc/def.j', '.foo'), '/abc/def.j');
      assert.same(ctx.uri('http://abc.html', '.foo'), 'http://abc.html');
      assert.same(ctx.uri('abc/def.js', '.foo'), 'abc/def.js');
    });

    test('should normalize id wrt dir', () => {
      var ctx = module.ctx;
      assert.same(ctx.normalizeId('../foo', 'bar/baz/'), 'bar/foo');
      assert.same(ctx.normalizeId('./foo', 'bar/baz/'), 'bar/baz/foo');
      assert.same(ctx.normalizeId('foo/bar', 'bar/baz/'), 'foo/bar');
    });

    test('should generate urls relative to module', () => {
      const myCtx = new ctx.constructor({context: 'my ctx', baseUrl: 'foo'});
      var mod = new module.constructor(myCtx, 'test-data/foo');
      assert.same(mod.toUrl('../def.js'), 'foo/def.js');
      assert.same(require.toUrl('./foo'), require.module.toUrl('./foo'));
      assert.same(mod.toUrl('abc/def.j'), 'foo/abc/def.j');
      assert.same(mod.toUrl('./abc/def.html'), 'foo/test-data/abc/def.html');
    });

    test('should normalize ids relative to module', () => {
      var mod = new module.constructor(module.ctx, 'test-data/foo');
      assert.same(mod.normalizeId('abc/def.j'), 'abc/def.j');
      assert.same(mod.normalizeId('./abc/def.html'), 'test-data/abc/def.html');
      assert.same(mod.normalizeId('../abc/def.html'), 'abc/def.html');
      assert.same(mod.normalizeId('../def.js'), '../def.js');
      assert.same(mod.normalizeId('http://def.html'), 'http://def.html');
    });

    test('should handle callback', (done) => {
      require('./test-data/simple', function (simple) {
        try {
          assert.same(simple, 'simple');
          var inner;
          require('./test-data/simple', function (simple) {
            inner = simple;
          });
          assert.same(inner, 'simple');
          done();
        } catch (ex) {
          done(ex);
        }
      }, () => {
        done(new Error('should not be loaded'));
      });
    });

    test('should allow requiring multiple modules in one call', (done) => {
      const myCtx = new ctx.constructor({context: 'my ctx', baseUrl});
      const list = 'test-data/dep2 require ./test-data/subdir/dep1 module ./test-data/../test-data/simple exports'
            .split(' ');
      myCtx.require(list, (
        d2, req, d1, mod, simple) => {
          try {
            assert.same(req, myCtx.require);
            assert.same(mod.ctx, myCtx);
            assert.same(d2, true);
            assert.isFunction(d1);
            assert.same(simple, 'simple');
            done();
          } catch (ex) {
            done(ex);
          }
        }, done);
    });

    test('should catch module init errors', () => {
      const myCtx = new ctx.constructor({context: 'my ctx', baseUrl});
      const mod = new Module(myCtx, 'foo-err');
      const onError = mod.ctx.onError;
      let expErr;
      mod.ctx.onError = (err) => {expErr = err};
      try {
        Module._prepare(mod, [], () => {
          throw new Error('bang!');
        });
      } finally {
        mod.ctx.onError = onError;
      }
      assert.same(expErr.onload, undefined);
      assert.equals(expErr.toString(), m(/bang!/));
    });

    test('should handle syntax errors', (done) => {
      const myCtx = new ctx.constructor({context: 'my ctx', baseUrl});
      myCtx.require('test-data/syntax-error', () => {
        try {
          assert.fail('should not have loaded module');
        } catch (ex) {
          done(ex);
        }
      }, function (error, mod) {
        try {
          if (isServer) {
            assert.instanceof(error, SyntaxError);
          } else {
            assert.instanceof(error, Error);
          }
          done();
        } catch (ex) {
          done(ex);
        }
      });
    });

    test('should not need a define by default', (done) => {
      const myCtx = new ctx.constructor({context: 'my ctx', baseUrl});

      myCtx.require('./test-data/no-define', () => {
        try {
          assert.same(globalThis.NO_DEFINE, 'success');
          done();
        } catch (ex) {
          done(ex);
        }
      }, done);
    });

    test('can recover from error', (done) => {
      const myCtx = new ctx.constructor({context: 'my ctx', baseUrl, enforceDefine: true});
      myCtx.require('./test-data/not-found', () => {
        myCtx.require('test-data/dep-on-not-found', function (arg) {
          try {
            assert.same(arg, 'success');
            done();
          } catch (ex) {
            done(ex);
          }
        }, done);
      }, function (err, mod) {
        try {
          assert.equals(err.toString(), m(isServer ? /no such file/ : /failed to load/));
          assert.same(err.module.id, 'test-data/not-found');
          assert.same(err.module, mod);
          assert.same(err.onload, true);
        } catch (ex) {
          done(ex);
          return;
        }
        Module._prepare(mod, null, 'success');
      });
    });

    test('should handle missing define', (done) => {
      const myCtx = new ctx.constructor({context: 'my ctx', baseUrl, enforceDefine: true});
      myCtx.require('./test-data/nested-no-define', () => {
        try {
          assert.fail('should not be loaded');
        } catch (ex) {
          done(ex);
        }
      }, function (type, mod) {
        var onError = mod.ctx.onError;
        mod.ctx.onError = () => {};
        setTimeout(() => {
          try {
            assert.same(ctx.modules['no-define']);
            assert.same(ctx.modules['nested-no-define']);
            if (isClient) {
              assert.same(document.querySelector('script[src="./no-define.js"]'), null);
              assert.same(document.querySelector('script[src="./nested-no-define.js"]'), null);
            }
            done();
          } catch (ex) {
            done(ex);
          } finally {
            mod.ctx.onError = onError;
          }
        });
      });
    });
  });
});

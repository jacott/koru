isClient && define((require, exports, module)=>{
  'use strict';
  /**
   * A Mock version of [CacheStorage](#mdn:/API/CacheStorage)
   *
   * ## Limitations
   * `match` only supports strictly checking the url.
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const MockPromise     = require('koru/test/mock-promise');

  const {stub, spy, util} = TH;
  const {Request} = window;

  const sut  = require('./mock-cache-storage');

  const poll = ()=>{MockPromise._poll()};

  let v = {};
  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      MockPromise.stubPromise();
      v.caches = new sut();
    });

    afterEach(()=>{
      v = {};
    });

    test("constructor", async ()=>{
      /**
       * Create an instance suitable for replacing `window.caches`
       **/
      MockPromise.restore();

      const {Request} = window;
      const MockCacheStorage = api.class();
      //[
      const caches = new MockCacheStorage;
      refute(await caches.match(new Request('/index.js')));
      //]
    });

    test("open", ()=>{
      const p = v.caches.open('foo');
      assert(p instanceof MockPromise);
      p.then(c => v.cache = c);

      poll();

      assert(v.cache);
      assert.same(v.cache, v.caches._caches.foo);

      v.caches.open('foo').then(c => v.same = c);
      v.caches.open('bar').then(c => v.notsame = c);

      poll();

      assert.same(v.same, v.cache);
      refute.same(v.notsame, v.cache);
    });

    group("with cache", ()=>{
      beforeEach(()=>{
        v.caches.open('foo').then(c => v.cache = c); poll();
        v.req = new Request('/foo.js'); v.resp = {status: 200, myrep: 'foo'};
        v.cache.put(v.req, v.resp); poll();
      });

      test("put, match", ()=>{
        const {cache} = v;

        const req = new Request('/index.js'), resp = {status: 200, myrep: 'index'};

        const putPromise = cache.put(req, resp);
        assert.same(putPromise._state, 'resolved');

        const matchPromise = cache.match(new Request('/index.js'));

        assert.same(matchPromise._state, 'resolved');

        matchPromise.then(r => v.ans = r);

        poll();

        assert.same(v.ans, resp);

        v.caches.match(req).then(r => v.cachesMatch = r);

        poll();

        assert.same(v.cachesMatch, resp);
      });

      test("delete", ()=>{
        const {cache, req, resp} = v;

        cache.delete(req).then(r => v.del = r);

        cache.match(req).then(r => v.ans = r);
        poll();

        assert.same(v.ans, undefined);
        assert.isTrue(v.del);

        cache.delete(req).then(r => v.del = r);
        poll();
        assert.isFalse(v.del);
      });

      test("caches.keys", ()=>{
        const {caches, cache: foo} = v;
        let bar;

        caches.open('bar').then(c => bar = c); poll();

        caches.keys().then(keyList => v.ans = keyList);

        poll();

        assert.equals(v.ans.sort(), ['bar', 'foo']);
      });

      test("caches.delete", ()=>{
        v.caches.delete('foo').then(r => v.del = r);
        poll();
        assert.isTrue(v.del);

        assert.equals(v.caches._caches, {});

        v.caches.delete('foo').then(r => v.del = r);
        poll();
        assert.isFalse(v.del);

      });
    });
  });
});

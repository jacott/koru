isClient && define((require, exports, module)=>{
  /**
   * Uncache is used for development to uncache fixed assets or the service-worker and reload app if
   * they are modified.
   **/
  'use strict';
  const koru            = require('koru');
  const MockCacheStorage = require('koru/client/mock-cache-storage');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util, intercept, stubProperty} = TH;

  const Uncache = require('./uncache');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    const {Request} = window;
    const caches = new MockCacheStorage;
    test("start", async ()=>{
      /**
       * Start tracking fixed asset changes and service-worker.
       **/
      api.method();
      stub(koru, 'unload');
      stub(koru, 'reload');
      after(Uncache);
      stubProperty(window, 'caches', {value: caches});

      const cache = await caches.open('user-cache');

      //[
      Uncache.start();

      await cache.put(new Request('/'), {status: 200, body: 'code...'});
      await koru.unload('i_do_not_exist');
      refute.called(koru.reload);

      assert(await caches.match('/'));

      await koru.unload('.build/index.html'); // simulate server sending unload to client
      refute(await caches.match('/'));
      assert.called(koru.reload);

      Uncache.stop();
      //]

      //[
      Uncache.start({'public/my.css': '/public/my.css'});

      await cache.put(new Request('/public/my.css'), {status: 200, body: 'css...'});
      await koru.unload('public/my.css'); // simulate server sending unload to client
      refute(await caches.match('/public/my.css'));

      Uncache.stop();
      //]

      //[
      // service-worker
      Uncache.start();

      stub(koru, 'unregisterServiceWorker');

      await koru.unload('service-worker');

      assert.called(koru.unregisterServiceWorker);

      await koru.unload('sw'); // this works as well

      assert.calledTwice(koru.unregisterServiceWorker);
      //]

      await koru.unload('service-worker.js');
      assert.calledTwice(koru.unregisterServiceWorker);
    });
  });
});

isClient && define((require, exports, module)=>{
  const koru            = require('koru');
  const MockPromise     = require('koru/test/mock-promise');
  const util            = require('koru/util');
  const TH              = require('koru/test-helper');

  const {stub, spy, stubProperty} = TH;

  const sut = require('./sw-manager');
  const staticCacheName = 'app-v1';

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    let registration, newWorker, controller;
    before(()=>{
      MockPromise.stubPromise();
    });

    beforeEach(()=>{
      TH.stubProperty(koru, 'globalErrorCatch', {value(err) {koru.unhandledException(err)}});
      registration = {
        addEventListener: stub(),
        update() {return Promise.resolve()},
      };
      TH.stubProperty(navigator, 'serviceWorker', {value: {
        register: stub().returns(Promise.resolve(registration)),
        addEventListener: stub(),
        removeEventListener: stub(),
        get controller() {return controller || null},
      }});
      newWorker = (state='installed') =>  {
        return {
          addEventListener: stub(),
          state,
          scriptURL: 'http://test.com/service-worker.js',
        };
      };
    });

    afterEach(()=>{
      sut.stop();
      MockPromise._stop();
      registration = newWorker = controller = void 0;
    });

    group("registration", ()=>{
      beforeEach(()=>{
        controller = newWorker('activated');
      });

      test("pre installing", ()=>{
        sut.start();
        assert.calledWith(navigator.serviceWorker.register, '/service-worker.js');
        Promise._poll();

        assert.calledOnceWith(registration.addEventListener, 'updatefound', TH.match.func);

        const worker = registration.installing = newWorker();
        registration.addEventListener.yield();

        assert.calledWith(worker.addEventListener, 'statechange');
        const onUpdateWaiting = stub();
        after(sut.onUpdateWaiting(onUpdateWaiting));
        worker.addEventListener.yield();

        assert.calledWith(onUpdateWaiting, worker);
      });

      test("already installing", ()=>{
        const updatefound = registration.addEventListener.withArgs('updatefound');
        sut.start();
        const worker = registration.installing = newWorker();
        Promise._poll();
        updatefound.yieldAndReset();

        assert.calledWith(worker.addEventListener, 'statechange');
        const onUpdateWaiting = stub();
        after(sut.onUpdateWaiting(onUpdateWaiting));
        worker.addEventListener.yield();

        assert.calledWith(onUpdateWaiting, worker);
      });

      test("already waiting", ()=>{
        const updatefound = registration.addEventListener.withArgs('updatefound');
        const worker = registration.waiting = newWorker('installed');
        sut.start();
        Promise._poll();
        updatefound.yieldAndReset();

        assert.calledWith(worker.addEventListener, 'statechange');
        worker.addEventListener.yieldAndReset();

        Promise._poll();

        const onUpdateWaiting = stub();
        after(sut.onUpdateWaiting(onUpdateWaiting));
        assert.calledWith(onUpdateWaiting, worker);
      });
    });

    test("prepareNewVersion", ()=>{
      const worker = newWorker('installed');
      stubProperty(sut, 'registration', {value: {waiting: worker}});
      worker.postMessage = stub();
      const onmessage = navigator.serviceWorker.addEventListener.withArgs('message');

      sut.start();

      let done = false;
      const p = sut.prepareNewVersion('abc123').then(()=>{done = true});

      assert.calledWith(worker.postMessage, {action: 'loadBase', search: '?abc123'});

      Promise._poll();

      refute(done);

      onmessage.yield({data: {action: 'baseLoaded'}});
      Promise._poll();

      assert(done);
    });

    group("statechange", ()=>{
      beforeEach(()=>{
        stub(koru, 'reload');
      });

      test("first time activated", ()=>{
        const onUpdateWaiting = stub();
        after(sut.onUpdateWaiting(onUpdateWaiting));
        const updatefound = registration.addEventListener.withArgs('updatefound');
        const onmessage = navigator.serviceWorker.addEventListener.withArgs('message');
        sut.start();
        const worker = registration.waiting = newWorker('installed');
        Promise._poll();
        refute.called(worker.addEventListener);
        updatefound.yieldAndReset();
        worker.state = 'activated';
        worker.postMessage = stub();
        stubProperty(window, 'KORU_APP_VERSION', {
          value: "v1.1.1-52-g80018ec,72a1a01b5fcf2b6ccaa45b11d42904ab"});
        worker.addEventListener.yield();

        refute.called(koru.reload);
        refute.called(onUpdateWaiting);
        assert.calledWith(worker.postMessage, {
          action: 'loadBase', search: '?72a1a01b5fcf2b6ccaa45b11d42904ab'});

        worker.addEventListener.yield();
        assert.calledOnce(worker.postMessage);

        onmessage.yield({data: {action: 'baseLoaded'}});

        worker.addEventListener.yield();
        assert.calledTwice(worker.postMessage);
      });

      test("new worker activated", ()=>{
        const updatefound = registration.addEventListener.withArgs('updatefound');
        controller = newWorker('activated');
        sut.start();
        const worker = registration.waiting = newWorker('installed');
        Promise._poll();
        updatefound.yieldAndReset();
        worker.state = 'activated';
        worker.addEventListener.yield();

        assert.called(koru.reload);
      });
    });

    group("onmessage", ()=>{
      test("reload", ()=>{
        const onmessage = navigator.serviceWorker.addEventListener.withArgs('message');
        sut.start();

        assert.called(onmessage);

        stub(koru, 'reload');
        onmessage.yield({data: {action: 'reload'}});
        assert.called(koru.reload);
      });
    });

    group("update", ()=>{
      let tryUpdate, updating, done;
      beforeEach(()=>{
        done = false;
        updating = void 0;
        tryUpdate = () => {
          Promise._poll();
          stub(sut.registration, 'update').returns(updating = Promise._resolveOrReject());
          sut.update().then(() => done = true);
          Promise._poll();
        };
      });

      test("update", ()=>{
        sut.start();
        tryUpdate();
        updating._resolve();
        refute(done);
        Promise._poll();
        assert(done);
      });

      test("no serviceworker update", ()=>{
        tryUpdate();
        assert(done);
      });
    });

    group("loadNewVersion", ()=>{
      let caches, pc1;
      beforeEach(()=>{
        pc1 = void 0;
        caches = {
          keys() {return Promise.resolve(["c1", staticCacheName])},
          open(name) {return Promise.resolve(this[name])},
          [staticCacheName]: {delete: stub('c2', null, () => Promise._resolveOrReject())},
          delete: stub().returns(pc1 = Promise._resolveOrReject()),
        };
        TH.stubProperty(window, 'caches', {value: caches});
        stub(koru, 'reload');
      });

      test("no worker", ()=>{
        sut.start();

        sut.loadNewVersion();
        assert.called(koru.reload);
      });

      test("waiting", ()=>{
        registration.waiting = newWorker('installed');
        controller = newWorker('activated');
        registration.waiting.postMessage = stub();

        sut.start();
        Promise._poll();

        sut.loadNewVersion();

        Promise._poll();
        pc1._resolve();

        refute.called(koru.reload);
        assert.calledWith(registration.waiting.postMessage, {action: 'reload'});
      });

      test("activated", ()=>{
        registration.active = controller = newWorker('activated');
        controller.postMessage = stub();

        registration.update = stub().returns(MockPromise.resolve());

        sut.start();
        Promise._poll();

        sut.loadNewVersion();

        Promise._poll();
        pc1._resolve();

        refute.called(koru.reload);
        assert.calledWith(controller.postMessage, {action: 'reload'});
        refute.called(registration.update);
      });
    });
  });
});

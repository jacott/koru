isClient && define((require, exports, module)=>{
  'use strict';
  /**
   * PreloadSubscription extends {#../subscription} to facilitate preloading documents from a client
   * {#koru/model/query-idb} or similar in addition to fetching from server. This class overrides
   * the {#../subscription#connect} method with calls to the methods described below.
   **/
  const koru            = require('koru');
  const Model           = require('koru/model');
  const Subscription    = require('koru/pubsub/subscription');
  const SubscriptionSession = require('koru/pubsub/subscription-session');
  const Session         = require('koru/session');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {private$} = require('koru/symbols');

  const {IDBKeyRange} = window;

  const {stub, spy, onEnd, util} = TH;

  const PreloadSubscription = require('./preload-subscription');

  const promiseResolve = () => {
    let resolve;
    const promise = new Promise((_resolve) => {resolve = _resolve});
    return {promise, resolve};
  };

  const {connected$} = SubscriptionSession[private$];

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      SubscriptionSession.unload(Session);
    });

    test("onConnect already connected", ()=>{
      const connect = stub(SubscriptionSession.prototype, 'connect');
      class Library extends PreloadSubscription {}
      const sub = Library.subscribe();

      sub[connected$]({});

      const callback = stub();
      const handle = sub.onConnect(callback);
      sub[connected$]({});
      assert.calledWith(callback, null);
    });

    test("constructor", ()=>{
      /**
       * Used to initialise matchers and any other common synchronous work
       *
       * @param {...any-type} [args] the arguments to send to the publication.
       * @param {Session} session The session to subscribe to (defaults to {#koru/session/main}).
       **/
      const PreloadSubscription = api.class();
      class Book extends Model.BaseModel {
        static get modelName() {return 'Book'}
      }
      //[
      class LibrarySub extends PreloadSubscription {
        constructor(args) {
          super(args);
          const {shelf} = args;
          this.match(Book, doc => doc.shelf === shelf);
        }
      }
      LibrarySub.pubName = 'Library';
      const sub = LibrarySub.subscribe({shelf: 'mathematics'});
      const book1 = {shelf: 'mathematics'};
      assert.isTrue(sub._matches.Book.value(book1));
      //]
    });

    test("connect no idb", ()=>{
      class LibrarySub extends PreloadSubscription {
      }
      LibrarySub.pubName = 'Library';

      let resolve;

      const superConnect = spy(Subscription.prototype, 'connect').invokes(c  => {
        return c.returnValue;
      });

      const callback = stub();
      const sub = LibrarySub.subscribe({shelf: 'mathematics'}, callback);

      refute.called(callback);
      sub[connected$]({});
      assert.called(callback);
    });

    test("preload", async ()=>{
      /**
       * Override this (usally) async method to load client records, using say,
       * {#koru/model/query-idb}. Should `await` for loads to complete before returning. Any
       * exception thrown during execution will be caught and sent to the
       * {#../subscription#onConnect} observers.

       * @param idb returned from {##getQueryIDB}

       * @returns {"skipServer" | "waitServer" | undefined} Unless return is `"skipServer"` the
       * server will be called with the subscription request.
       *
       * If return is `"waitServer"` {#../subscription#onConnect} observers will be called after
       * server request completes; otherwise observers are called immediately.
       **/
      api.protoMethod();
      class Book {
        static get query() {
          return {count: () => Book.docs.length};
        }
      }
      const whenReady = promiseResolve();
      const books = [{_id: 'book1'}];
      const idb = {
        isReady: false,
        async whenReady() {},
        get: stub().returns({name: 'mathematics'}),
        index: () => ({getAll: () => Promise.resolve(books)}),
        loadDocs: (model, docs) => {
          Book.docs = docs;
        }
      };
      const isOffline = false;
      //[
      class LibrarySub extends PreloadSubscription {
        getQueryIDB() {return idb}
        async preload(idb) {
          const shelf = await idb.get('last', 'self');
          if (self == null) return "waitServer";
          const books = await idb.index('Book', 'shelf').getAll(IDBKeyRange.only(shelf.name));
          idb.loadDocs('Book', books);
          if (isOffline) return "skipServer";
        }
      }
      LibrarySub.pubName = 'Library';
      //]
      let resolve;
      const promise = new Promise((_resolve) => {resolve = _resolve});
      const callback = (err) => {resolve(err)};
      const sub = LibrarySub.subscribe({shelf: 'mathematics'}, callback);
      const err = await promise;
      if (err) throw err;
      assert(Book.query.count(), 1);
    });

    test("preload returns undefined", async ()=>{
      const idb = {isReady: true};
      class LibrarySub extends PreloadSubscription {
        getQueryIDB() {return idb}
        async preload(idb, preloadComplete) {
        }
      }
      LibrarySub.pubName = 'Library';
      let resolve;

      const connect = promiseResolve();
      const superConnect = spy(Subscription.prototype, 'connect').invokes(c  => {
        connect.resolve();
        return c.returnValue;
      });

      const callback = stub();
      const sub = LibrarySub.subscribe({shelf: 'mathematics'}, callback);

      await connect.promise;
      sub[connected$]({});
      assert.called(callback);
    });

    test("preload returns waitServer", async ()=>{
      const idb = {isReady: true};
      class LibrarySub extends PreloadSubscription {
        getQueryIDB() {return idb}
        async preload(idb) {
          return "waitServer";
        }
      }
      LibrarySub.pubName = 'Library';
      let resolve;

      const connect = promiseResolve();
      const superConnect = spy(Subscription.prototype, 'connect').invokes(c  => {
        connect.resolve();
        return c.returnValue;
      });

      const callback = stub();
      const sub = LibrarySub.subscribe({shelf: 'mathematics'}, callback);

      await connect.promise;
      refute.called(callback);
      sub[connected$]({});
      assert.called(callback);
    });

    test("preload returns skipServer", async ()=>{
      const idb = {isReady: true};
      class LibrarySub extends PreloadSubscription {
        getQueryIDB() {return idb}
        async preload(idb) {
          await pl.resolve();
          return "skipServer";
        }
      }
      LibrarySub.pubName = 'Library';
      let resolve;

      const pl = promiseResolve();
      const superConnect = spy(Subscription.prototype, 'connect');

      const cb = promiseResolve();
      const callback = stub().invokes(()=>{
        cb.resolve();
      });
      const sub = LibrarySub.subscribe({shelf: 'mathematics'}, callback);

      await pl.promise;
      refute.called(callback);
      await cb.promise;
      refute.called(superConnect);
      assert.called(callback);
    });

    test("getQueryIDB", async ()=>{
      /**
       * Override this method to return a {#koru/model/query-idb} like instance or undefined (if
       * none). The idb instance is passed to the {##preload} method. If no idb is returned
       * {##preload} is not called.
       **/
      let idb = {
        isReady: false,
        async whenReady() {},
        get: stub().returns({name: 'mathematics'}),
      };
      //[
      class LibrarySub extends PreloadSubscription {
        getQueryIDB() {return idb}
        async preload(idb) {
          this.shelf = await idb.get('last', 'self');
        }
      }//]
      api.protoMethod(void 0, {subject: LibrarySub.prototype});
      let resolve;
      const promise = new Promise((_resolve) => {resolve = _resolve});
      const callback = (err) => {resolve(err)};
      const sub = LibrarySub.subscribe({shelf: 'mathematics'}, callback);
      const err = await promise;
      if (err) throw err;
      assert.equals(sub.shelf, {name: 'mathematics'});
    });

    test("serverResponse", async ()=>{
      /**
       * Override this method to intercept the serverResponse to the subscribe.

       * @param err null for success else error from server

       * @param idb the object returned from {##getQueryIDB}
       **/
      api.protoMethod();
      let idb = {
        isReady: false,
        async whenReady() {},
        get: stub().returns({name: 'mathematics'}),
      };

      const connect = promiseResolve();
      let superConnectCalled = false;
      const superConnect = spy(Subscription.prototype, 'connect').invokes(c  => {
        superConnectCalled = true;
        connect.resolve();
        return c.returnValue;
      });
      {
        //[
        let callbackNotCalled = false;
        class LibrarySub extends PreloadSubscription {
          getQueryIDB() {return idb;}
          serverResponse(err, idb) {
            this.serverResponseArgs = [err, idb];
            callbackNotCalled = callback.firstCall === void 0;//]
            super.serverResponse(err, idb);//[#
          }
        }
        let resolve;
        const promise = new Promise((_resolve) => {resolve = _resolve});
        const callback = (err) => {resolve(err)};
        const sub = LibrarySub.subscribe({shelf: 'mathematics'}, callback);

        await connect.promise;
        sub[connected$]({lastSubscribed: 0});
        const err = await promise;
        if (err) throw err;
        assert.isTrue(callbackNotCalled); // assert serverResponse called before callback
        assert.equals(sub.serverResponseArgs, [null, idb]);
        //]
      }

      {
        //[
        // server error
        class BookSub extends PreloadSubscription {
          serverResponse(err, idb) {
            this.serverResponseArgs = [err, idb];//]
            super.serverResponse(err, idb);//[#
          }
        }
        const sub = BookSub.subscribe('book1');
        const err = new koru.Error(500, "server error");
        sub.stop(err);
        assert.equals(sub.serverResponseArgs, [err, void 0]);
        //]
      }
    });

    test("connect without QueryIDB", ()=>{
      let preloadCalled = false;
      class LibrarySub extends PreloadSubscription {
        preload(idb, preloadComplete) {preloadCalled = true}
      }
      LibrarySub.pubName = "Library";

      const callback = stub();
      const sub = LibrarySub.subscribe({shelf: 'Mathematics'}, callback);
      assert.equals(sub.args, {shelf: 'Mathematics'});
      assert.isFalse(preloadCalled);
    });
  });
});

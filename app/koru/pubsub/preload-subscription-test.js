isClient && define((require, exports, module)=>{
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

  const {IDBKeyRange} = window;

  const {stub, spy, onEnd, util} = TH;

  const PreloadSubscription = require('./preload-subscription');

  const promiseResolve = () => {
    let resolve;
    const promise = new Promise((_resolve) => {resolve = _resolve});
    return {promise, resolve};
  };


  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      SubscriptionSession.unload(Session);
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

    test("preload", async ()=>{
      /**
       * A (usally) async method to load client records, using say, {#koru/model/query-idb}. Can
       * load before and after server connection request. `await` any before loads and call
       * `preloadComplete` once all loads have completed.

       * @param idb returned from {##getQueryIDB}

       * @param preloadComplete call this once all loading has finished. Takes one argument which is
       * an error if an error occurred.
       **/
      api.protoMethod();
      class Book {
        static get query() {
          return {count: () => Book.docs.length};
        }
      }
      const whenReady = promiseResolve();
      const books = [{_id: 'book1'}];
      let idb = {
        isReady: false,
        async whenReady() {},
        get: stub().returns({name: 'mathematics'}),
        index: () => ({getAll: () => Promise.resolve(books)}),
        loadDocs: (model, docs) => {
          Book.docs = docs;
        }
      };
      //[
      class LibrarySub extends PreloadSubscription {
        getQueryIDB() {return idb}
        async preload(idb, preloadComplete) {
          const shelf = await idb.get('last', 'self');

          idb.index('Book', 'shelf').getAll(IDBKeyRange.only(shelf.name))
            .then(books => {
              idb.loadDocs('Book', books);
              preloadComplete();
            }).catch(ex => {preloadComplete(ex)});
        }
      }
      LibrarySub.pubName = 'Library';
      let resolve;
      const promise = new Promise((_resolve) => {resolve = _resolve});
      const callback = (err) => {resolve(err)};
      const sub = LibrarySub.subscribe({shelf: 'mathematics'}, callback);
      const err = await promise;
      if (err) throw err;
      assert(Book.query.count(), 1);
      //]
    });

    test("getQueryIDB", async ()=>{
      /**
       * Should return a {#koru/model/query-idb} like instance or undefined (if none). The idb
       * instance is passed to the {##preload} method. If no idb is returned {##preload} is not
       * called.
       **/
      let idb = {
        isReady: false,
        async whenReady() {},
        get: stub().returns({name: 'mathematics'}),
      };
      //[
      class LibrarySub extends PreloadSubscription {
        getQueryIDB() {return idb}
        async preload(idb, preloadComplete) {
          this.shelf = await idb.get('last', 'self');
          preloadComplete();
        }
      }//]
      api.protoMethod(void 0, {subject: LibrarySub.prototype});//[#
      let resolve;
      const promise = new Promise((_resolve) => {resolve = _resolve});
      const callback = (err) => {resolve(err)};
      const sub = LibrarySub.subscribe({shelf: 'mathematics'}, callback);
      const err = await promise;
      if (err) throw err;
      assert.equals(sub.shelf, {name: 'mathematics'});
      //]
    });

    test("serverResponse", async ()=>{
      /**
       * Intercept the serverResponse to the subscribe.

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
        sub._connected({lastSubscribed: 0});
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

    group("with queryIDB", ()=>{
      const initConnect = async () => {
        const whenReady = promiseResolve();
        const preload = promiseResolve();
        const preloadStarted = promiseResolve();
        const connect = promiseResolve();
        let superConnectCalled = false;
        const superConnect = spy(Subscription.prototype, 'connect').invokes(c  => {
          superConnectCalled = true;
          connect.resolve();
          return c.returnValue;
        });

        const idb = {
          isReady: false,
          async whenReady() {return whenReady.promise}
        };

        class MySub extends PreloadSubscription {
          async preload(_idb, preloadComplete) {
            this.preloadComplete = preloadComplete;
            preloadStarted.resolve();
            return preload.promise;
          }

          getQueryIDB() {
            return idb;
          }
        }
        MySub.pubName = "My";

        const callback = stub();

        const sub = MySub.subscribe(123, callback);
        sub.serverResponse = stub();

        whenReady.resolve();
        await whenReady.promise;
        refute(sub.preloadComplete);
        await preloadStarted.promise;
        refute.called(superConnect);
        preload.resolve();
        refute(superConnectCalled);
        await connect.promise;
        assert.called(superConnect);
        refute.called(callback);

        return {sub, callback};
      };

      test("connect client before server", async ()=>{
        const {sub, callback} = await initConnect();

        sub.preloadComplete();
        assert.called(callback);

        refute.called(sub.serverResponse);
        sub._connected({});
        assert.called(sub.serverResponse);
        assert.calledOnce(callback);
      });

      test("server finish before client", async ()=>{
        const {sub, callback} = await initConnect();

        refute.called(sub.serverResponse);
        sub._connected({});
        assert.called(sub.serverResponse);
        assert.calledOnce(callback);

        sub.preloadComplete();
        assert.called(callback);
      });
    });
  });
});

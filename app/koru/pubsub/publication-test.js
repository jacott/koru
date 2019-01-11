isServer && define((require, exports, module)=>{
  /**
   * A Publication is a abstract interface for handling subscriptions.
   *
   * See also {#../subscription}
   **/
  const koru            = require('koru');
  const ModelMap        = require('koru/model/map');
  const TransQueue      = require('koru/model/trans-queue');
  const Val             = require('koru/model/validation');
  const MockConn        = require('koru/pubsub/mock-conn');
  const MockDB          = require('koru/pubsub/mock-db');
  const session         = require('koru/session');
  const PublishTH       = require('koru/session/publish-test-helper-server');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, onEnd, util, intercept, stubProperty} = TH;

  const Publication = require('./publication');

  const API = api;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    let conn, origQ;
    beforeEach(()=>{
      origQ = session._commands.Q;
      conn = PublishTH.mockConnection("conn1");
      conn.onMessage = (args)=>{
        session._commands.Q.call(conn, args);
      };
    });

    afterEach(()=>{
      session._commands.Q = origQ;
      Publication.delete('Library');
    });

    test("constructor", ()=>{
      /**
       * Build an incomming subscription.

       * @param conn The connection of the subscription

       * @param id The id of the subscription

       * @param lastSubscribed the time in ms when the subscription last connected

       **/
      const Publication = api.class();

      let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);
      const module = new TH.MockModule("library-pub");
      //[
      const lastSubscribed = Date.now()-util.DAY;

      let sub;
      class Library extends Publication {
        constructor(options) {
          super(options);
          sub = this;
        }
      }
      Library.module = module;
      assert.same(Library.pubName, 'Library');

      conn.onMessage(["sub1", 1, 'Library', [{shelf: "mathematics"}], lastSubscribed]);


      assert.same(sub.constructor, Library);
      assert.same(sub.conn, conn);
      assert.same(sub.id, 'sub1');
      assert.same(sub.lastSubscribed, util.dateNow());
      //]
    });

    test("init", ()=>{
      /**
       * This is where to fetch and send documents matching the `args` supplied.
       * On completion of the init method the server will inform the client the connection is
       * successful. If an error is thrown then the client will be inform the connection is
       * unsuccessful.
       *
       * @param {...any-type} args from client
       **/
      api.protoMethod();

      let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);
      //[
      const lastSubscribed = now-util.DAY;

      let sub;
      class Library extends Publication {
        init({shelf}) {
          sub = this;
          Val.allowIfValid(typeof shelf === 'string', 'shelf');
          this.conn.added("Book", "b123", {title: "Principia Mathematica"});
        }
      }
      Library.pubName = 'Library';

      conn.onMessage(["sub1", 1, 'Library', [{shelf: "mathematics"}], lastSubscribed]);

      assert.same(sub.conn, conn);
      assert.same(sub.id, 'sub1');
      assert.same(sub.lastSubscribed, util.dateNow());
      assert.calledWith(conn.added, "Book", "b123", {title: "Principia Mathematica"});
      assert.calledWith(conn.sendBinary, 'Q', ['sub1', 1, 200, util.dateNow()]);
      assert.isFalse(sub.isStopped);
      //]

      TH.noInfo();
      //[
      // Validation error
      conn.sendBinary.reset();

      conn.onMessage(["sub1", 1, 'Library', [{shelf: 123}], lastSubscribed]);

      assert.calledWith(conn.sendBinary, 'Q', ['sub1', 1, 400, {shelf: [['is_invalid']]}]);
      assert.isTrue(sub.isStopped);
      //]
    });

    test("stop", ()=>{
      /**
       * Stop a subscription. This method can be called directly on the server to stop a
       * subscription. It will also be called indirectly by a stop request from the client.
       **/
      api.protoMethod();
      let sub;
      class Library extends Publication {
        init() {sub = this;}
      }
      Library.pubName = 'Library';

      conn.onMessage(["sub1", 1, 'Library', [{shelf: "mathematics"}]]);
      conn.sendBinary.reset();
      //[
      // server stops the subscription
      sub.stop();
      assert.isTrue(sub.isStopped);
      assert.calledWith(conn.sendBinary, 'Q', [sub.id]); // tell client we're stopped
      //]
      assert.equals(conn._subs, {});
    });

    test("client stop", ()=>{
      api.protoMethod("stop");
      let sub;
      class Library extends Publication {
        init() {sub = this;}
      }
      Library.pubName = 'Library';

      conn.onMessage(["sub1", 1, 'Library', [{shelf: "mathematics"}]]);
      conn.sendBinary.reset();
      //[
      // client stops the subscription
      conn.onMessage(["sub1", 2]);
      assert.isTrue(sub.isStopped);
      refute.called(conn.sendBinary); // no need to send to client
      //]
      assert.equals(conn._subs, {});
    });

    test("discreteLastSubscribed", ()=>{
      /**
       * converted `#lastSubscribed` time to the lower
       * `lastSubscribedInterval` boundry.
       *
       * {{example:0}}
       **/
      api.protoProperty();
      stubProperty(Publication, 'lastSubscribedInterval', 123);
      //[
      Publication.lastSubscribedInterval = 20*60*1000;
      const sub = new Publication({lastSubscribed: +new Date(2019, 0, 4, 9, 10, 11, 123)});
      assert.equals(new Date(sub.discreteLastSubscribed), new Date(2019, 0, 4, 9, 0));
      //]
    });

    test("lastSubscribed", ()=>{
      /**
       * The subscriptions last successful subscription time in ms
       **/
      api.protoProperty();
      const sub = new Publication({lastSubscribed: +new Date(2019, 0, 4, 9, 10, 11, 123)});
      assert.equals(new Date(sub.lastSubscribed), new Date(2019, 0, 4, 9, 10, 11, 123));
    });

    test("lastSubscribedInterval", ()=>{
      /**
       * Allow grouping subscription downloads to an interval bin so that subscriptions wanting
       * similar data can be satisfied with one pass of the database. Specified in milliseconds.
       *
       * See `#discreteLastSubscribed`
       **/
      api.property();
      assert.same(Publication.lastSubscribedInterval, 5*60*1000);
      onEnd(()=>{Publication.lastSubscribedInterval = 5*60*1000});

      Publication.lastSubscribedInterval = 10*60*1000;
      assert.same(Publication.lastSubscribedInterval, 10*60*1000);
    });

    test("lastSubscribedMaximumAge", ()=>{
      /**
       * Any subscription with a lastSubscribed older than this is aborted with error 400, reason
       * `{lastSubscribed: "too_old"}`. Specified in milliseconds. Defaults to 180 days.
       *
       * Client subscriptions should not send a `lastSubscribed` value if it is not later than this
       * value, by at least 10000. It should also mark any current documents as simulated.
       **/
      api.property();

      class Library extends Publication {}
      Library.pubName = "Library";

      Library.lastSubscribedMaximumAge = 30 * util.DAY;

      assert.same(Library.lastSubscribedMaximumAge, 30 * util.DAY);

      let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);

      conn.onMessage(["sub1", 1, 'Library', [], now - 30 * util.DAY]);
      assert.calledOnceWith(conn.sendBinary, 'Q', ['sub1', 1, 200, now]);

      conn.sendBinary.reset();
      conn.onMessage(["sub2", 1, 'Library', [], now - 31 * util.DAY]);
      assert.calledOnceWith(conn.sendBinary, 'Q', ['sub2', 1, 400, {lastSubscribed: "too_old"}]);
    });

    group("Union", ()=>{
      /**
       * Publication.Union is an abstract interface used to combine Subscriptions to minimise work
       * on the server.
       **/
      let api;
      before(()=>{
        api = API.innerSubject(Publication.Union);
      });

      afterEach(()=>{
        conn.sendEncoded.reset();
      });

      test("constructor", ()=>{
        /**
         * Create a Union instance
         **/
        const Union = api.class();
        //[
        class MyUnion extends Union {
        }
        const union = new MyUnion();
        assert.isFunction(union.buildBatchUpdate);
        //]
      });

      test("addSub", ()=>{
        /**
         * Add a subscriber to a union. This will cause {##loadInitial} to be run for the subscriber.

         * For performance, if other subscribers are added to the union then they will be added to
         * the same loadQueue (if still running) as a previous subscriber if and only if their
         * `#discreteLastSubscribed` is the same as a previous subscriber; otherwise a new
         * loadInitial will be run.
         *
         * It is important to note that addSub blocks the thread until loadInitial has finished.
         **/
        api.protoMethod();

        //[
        const db = new MockDB(['Book']);
        const mc = new MockConn(conn);

        const {Book} = db.models;
        const book1 = Book.create();
        const book2 = Book.create();

        class MyUnion extends Publication.Union {
          constructor(author_id) {
            super(Publication);
          }
          loadInitial(addDoc) {
            Book.query.forEach(addDoc);
          }
        }
        const union = new MyUnion();

        const sub = new Publication({id: 'sub1', conn, lastSubscribed: void 0});
        /** ⏿ ⮧ here we add the sub **/
        union.addSub(sub);

        const msgs = mc.decodeLastSend();

        assert.equals(msgs, [
          ['A', ['Book', 'book1', {name: 'Book 1'}]],
          ['A', ['Book', 'book2', {name: 'Book 2'}]]
        ]);
        //]
      });

      test("addSub withinInterval", ()=>{
        let now = util.dateNow();
        now  = Math.floor(now/Publication.lastSubscribedInterval)*Publication.lastSubscribedInterval;
        const conn1 = conn;
        const conn2 = PublishTH.mockConnection("conn2");
        const conn3 = PublishTH.mockConnection("conn3");
        const conn4 = PublishTH.mockConnection("conn4");
        const conn5 = PublishTH.mockConnection("conn5");

        const db = new MockDB(['Book']);
        const mc = new MockConn(conn);

        const {Book} = db.models;
        const book1 = Book.create();
        const book2 = Book.create();

        const events = [];

        class MyUnion extends Publication.Union {
          constructor(author_id) {
            super(Publication);
            this.future = new util.Future;
          }
          loadInitial(addDoc) {
            events.push(`li`);
            this.future.wait();
            Book.query.forEach(addDoc);
            events.push(`liDone`);
          }
        }
        const union = new MyUnion();
        onEnd(()=>{union.future.isResolved() || union.future.return()});

        const newSub = (id, conn, lastSubscribed)=>{
          const sub = new Publication({id, conn, lastSubscribed});
          koru.runFiber(()=>{
            union.addSub(sub);
            events.push('done'+sub.id);
          });
          return sub;
        };

        const completeQuery = ()=>{
          events.push('completeQuery');
          const future = union.future;
          union.future = new util.Future;
          future.return();
        };


        newSub('sub1', conn1, now);
        newSub('sub2', conn2, now + 30000);
        newSub('sub3', conn3, now - 1);
        newSub('sub4', conn4, now - 60000);
        newSub('sub5', conn5, now - 1 - Publication.lastSubscribedInterval);

        refute.called(conn1.sendEncoded);
        refute.called(conn2.sendEncoded);

        completeQuery();
        assert.called(conn1.sendEncoded);
        assert.called(conn2.sendEncoded);
        refute.called(conn3.sendEncoded);
        refute.called(conn4.sendEncoded);

        completeQuery();
        assert.called(conn3.sendEncoded);
        assert.called(conn4.sendEncoded);
        refute.called(conn5.sendEncoded);

        completeQuery();
        assert.calledOnce(conn1.sendEncoded);
        assert.calledOnce(conn3.sendEncoded);
        assert.called(conn5.sendEncoded);

        assert.equals(events, [
          'li',
          'completeQuery',
          'liDone',
          'donesub2',

          'li',
          'donesub1',

          'completeQuery',
          'liDone',
          'donesub4',
          'donesub3',
          'li',

          'completeQuery',
          'liDone',
          'donesub5']);
      });

      test("removeSub", ()=>{
        /**
         * Remove a subscriber from a union. When all subscriber have been removed from the union
         * {##stopListeners} will be called
         *
         * See {##addSub}, {##initObservers}
         **/
        api.protoMethod();

        //[
        const db = new MockDB(['Book']);
        const mc = new MockConn(conn);

        const {Book} = db.models;
        const book1 = Book.create();
        const book2 = Book.create();

        let stopListenersCalled = false;
        class MyUnion extends Publication.Union {
          stopListeners() {stopListenersCalled = true}
        }

        const union = new MyUnion();

        class MyPub extends Publication {
          constructor(options) {
            super(options);
            union.addSub(this);
          }

          stop() {
            super.stop();
            /** ⏿ ⮧ here we remove the sub **/
            union.removeSub(this);
          }
        }

        const sub = new MyPub({id: 'sub1', conn, lastSubscribed: void 0});

        sub.stop();

        assert.isTrue(stopListenersCalled);
        //]
      });

      test("stopListeners", ()=>{
        /**
         * Override this method to stop observers when all subscribers have been stopped.
         *
         * See {{##initObservers}}
         **/
        api.protoMethod();
        new Publication.Union().stopListeners();
        assert(true);
      });

      test("initObservers", ()=>{
        /**
         * Override this method to start observers when one or more subscribers are added.
         * the {##stopListeners} method should stop any observers started here.
         *
         * {##buildBatchUpdate} can be used to build an updater suitable as an argument for
         * {#koru/models/base-model.onChange}

         **/
        api.protoMethod();
        const db = new MockDB(['Book']);
        const mc = new MockConn(conn);
        const {Book} = db.models;

        const conn1 = conn;
        const conn2 = PublishTH.mockConnection("conn2");

        //[
        class MyUnion extends Publication.Union {
          stopListeners() {
            for (const listener of this.listeners)
              listener.stop();
          }

          initObservers() {
            const batchUpdate = this.buildBatchUpdate();

            this.listeners = [Book.onChange(batchUpdate)];
          }
        }
        const union = new MyUnion();

        const initObservers = spy(union, 'initObservers');
        const stopListeners = spy(union, 'stopListeners');

        const sub1 = new Publication({id: 'sub1', conn: conn1});
        union.addSub(sub1);
        const sub2 = new Publication({id: 'sub2', conn: conn2});
        union.addSub(sub2);

        union.removeSub(sub1);

        assert.calledOnce(initObservers);
        refute.called(stopListeners);

        union.removeSub(sub2);
        assert.calledOnce(stopListeners);
        //]

        union.addSub(sub2);
        assert.calledTwice(initObservers);
        union.removeSub(sub2);
        assert.calledTwice(stopListeners);
      });

      test("loadInitial", ()=>{
        /**
         * Override this method to select the initial documents to download when a new group of
         * subscribers is added.

         * @param addDoc a function to call with a doc to be added to the subscribers.

         * @param discreteLastSubscribed the lastSubscribed time related to this load request.
         **/
        api.protoMethod();
        const db = new MockDB(['Book']);
        const mc = new MockConn(conn);

        const {Book} = db.models;
        //[
        const book1 = Book.create();
        const book2 = Book.create();

        class MyUnion extends Publication.Union {
          constructor() {
            super(Publication);
          }
          loadInitial(addDoc, discreteLastSubscribed) {
            Book.query.forEach(addDoc);
          }
        }
        const union = new MyUnion();

        const sub = new Publication({id: 'sub1', conn});
        union.addSub(sub);

        const msgs = mc.decodeLastSend();

        assert.equals(msgs, [
          ['A', ['Book', 'book1', {name: 'Book 1'}]],
          ['A', ['Book', 'book2', {name: 'Book 2'}]]
        ]);
        //]
      });

      test("sendEncoded", ()=>{
        /**
         * Send a pre encoded {#koru/session/message} to all subscribers.
         *
         * See {#koru/session/server-connection#sendEncoded}
         **/
        api.protoMethod();

        const conn2 = PublishTH.mockConnection('sess124');

        const union = new Publication.Union();

        //[
        const sub1 = new Publication({id: 'sub123', conn});
        union.addSub(sub1);
        const sub2 = new Publication({id: 'sub124', conn: conn2});
        union.addSub(sub1);
        union.addSub(sub2);

        union.sendEncoded('myEncodedMessage');

        assert.calledWith(conn.sendEncoded, 'myEncodedMessage');
        assert.calledWith(conn2.sendEncoded, 'myEncodedMessage');
        //]
      });

      test("buildBatchUpdate", ()=>{
        /**
         * buildBatchUpdate builds an BatchUpdate function that can be used to broadcast document
         * updates to multiple client subscriptions.
         *
         * Updates are batched until the successful end of the current transaction and the resulting
         * message is sent to all subs in the union. If the transaction is aborted no messages are
         * sent.
         *
         * See also {##initObservers}
         **/
        api.protoMethod();

        //[
        const db = new MockDB(['Book']);
        const mc = new MockConn(conn);

        const {Book} = db.models;
        const book1 = Book.create();
        const book2 = Book.create();

        class MyUnion extends Publication.Union {
          constructor(author_id) {
            super(Publication);
          }
          initObservers() {

            /** ⏿ here we build the update ⮧ **/
            const batchUpdate = this.buildBatchUpdate();

            this.listeners = [Book.onChange(batchUpdate)];
          }

          stopListeners() {
            if (this.listeners !== void 0)
              for (const l of this.listeners) l.stop();
          }
        }
        const union = new MyUnion();

        const sub = new Publication({id: 's123', conn});
        union.addSub(sub);

        TransQueue.transaction(()=>{
          db.change(book1);
          Book.create();
          db.remove(book2);
        });

        const msgs = mc.decodeLastSend();

        assert.equals(msgs, [
          ['C', ['Book', 'book1', {name: 'name change'}]],
          ['A', ['Book', 'book3', {name: 'Book 3'}]],
          ['R', ['Book', 'book2']]
        ]);
        //]
      });
    });
  });
});

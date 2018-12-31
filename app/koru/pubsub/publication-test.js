isServer && define((require, exports, module)=>{
  /**
   * A Publication is a abstract interface for handling subscriptions.
   *
   * See also {#../subscription}
   **/
  const ModelMap        = require('koru/model/map');
  const TransQueue      = require('koru/model/trans-queue');
  const Val             = require('koru/model/validation');
  const MockConn        = require('koru/pubsub/mock-conn');
  const MockDB          = require('koru/pubsub/mock-db');
  const session         = require('koru/session');
  const PublishTH       = require('koru/session/publish-test-helper-server');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, onEnd, util, intercept} = TH;

  const Publication = require('./publication');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    let conn, origQ;
    beforeEach(()=>{
      origQ = session._commands.Q;
      conn = PublishTH.mockConnection();
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

    test("//lastSubscribedBin", ()=>{
      /**
       * `lastSubscribedBin` converts the subscription `lastSubscribed` time to the lower
       * {#.lastSubscribedInterval} boundry.
       *
       **/
    });

    test("//withinInterval", ()=>{
    });

    test("//lastSubscribedInterval", ()=>{
      /**
       * `lastSubscribedInterval` allows grouping subscription downloads to an interval bin so that
       * subscriptions wanting similar data can be satisfied with one pass of the database.
       *
       * See {##lastSubscribedBin}
       **/
    });

    group("Union", ()=>{
      /**
       * Publication.Union is an abstract interface used to combine Subscriptions to minimise work
       * on the server.
       **/
      let sapi;
      before(()=>{
        sapi = api.innerSubject(Publication.Union);
      });

      test("constructor", ()=>{
        /**
         * Create a Union instance
         **/
        const Union = sapi.class();
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
         * {#../#lastSubscribedBin} is the same as a previous subscriber; otherwise a new
         * loadInitial will be run.
         **/
        sapi.protoMethod();

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

        const sub = new Publication({id: 's123', conn, lastSubscribed: void 0});
        /** ⏿ ⮧ here we add the sub **/
        union.addSub(sub);

        const msgs = mc.decodeLastSend();

        assert.equals(msgs, [
          ['A', ['Book', 'book1', {name: 'Book 1'}]],
          ['A', ['Book', 'book2', {name: 'Book 2'}]]
        ]);
        //]
      });

      test("//addSub withinInterval", ()=>{

      });

      test("//removeSub", ()=>{
      });

      test("//stopListeners", ()=>{
      });

      test("//initObservers", ()=>{
      });

      test("//loadInitial", ()=>{
      });

      test("//sendEncoded", ()=>{
      });

      test("buildBatchUpdate", ()=>{
        /**
         * buildBatchUpdate builds an BatchUpdate function that can be used to broadcast document
         * updates to multiple client subscriptions.
         *
         * Updates are batched until the successful end of the current transaction and the resulting
         * message is sent to all subs in the union. If the transaction is aborted no messages are
         * sent.
         **/
        sapi.protoMethod();

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

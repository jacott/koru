isServer && define((require, exports, module)=>{
  /**
   * Union is an interface used to combine server subscriptions to minimise work on the server.
   *
   **/
  const koru            = require('koru');
  const DocChange       = require('koru/model/doc-change');
  const TransQueue      = require('koru/model/trans-queue');
  const MockConn        = require('koru/pubsub/mock-conn');
  const MockDB          = require('koru/pubsub/mock-db');
  const Publication     = require('koru/pubsub/publication');
  const PublishTH       = require('koru/pubsub/test-helper-server');
  const Session         = require('koru/session');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, onEnd, util, intercept, stubProperty, match: m} = TH;

  const Union = require('./union');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    let conn, origQ;
    beforeEach(()=>{
      origQ = Session._commands.Q;
      conn = PublishTH.mockConnection("conn1");
    });

    afterEach(()=>{
      PublishTH.stopAllSubs(conn);
      Session._commands.Q = origQ;
    });

    test("constructor", ()=>{
      /**
       * Create a Union instance
       **/
      const Union = api.class();
      //[
      const myHandle = {stop: stub()};
      class MyUnion extends Union {
        constructor() {
          super();
          this.handles.push(myHandle);
        }
      }
      const union = new MyUnion();
      assert.equals(union.handles, [myHandle]);
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

      const db = new MockDB(['Book']);
      const mc = new MockConn(conn);

      const {Book} = db.models;
      Book.where = stub().returns(Book.query);

      //[
      const book1 = Book.create();
      const book2 = Book.create();

      class MyUnion extends Union {
        constructor(author_id) {
          super();
          this.author_id = author_id;
        }
        loadInitial(addDoc) {
          Book.where('author_id', this.author_id).forEach(addDoc);
        }
      }
      const union = new MyUnion();

      const sub = new Publication({id: 'sub1', conn, lastSubscribed: void 0});
      /** ⏿ ⮧ here we add the sub **/
      union.addSub(sub);

      const msgs = mc.decodeLastSend();

      assert.equals(msgs, [
        ['A', ['Book', {_id: 'book1', name: 'Book 1'}]],
        ['A', ['Book', {_id: 'book2', name: 'Book 2'}]]
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

      class MyUnion extends Union {
        constructor() {
          super();
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
       * {##onEmpty} will be called
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

      let onEmptyCalled = false;
      class MyUnion extends Union {
        onEmpty() {
          super.onEmpty();
          onEmptyCalled = true;
        }
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

      assert.isTrue(onEmptyCalled);
      //]
    });

    test("onEmpty", ()=>{
      /**
       * This method is called when all subscribers have been removed from the union. It stops any
       * handles that have been pushed on to `#handles` and resets `#handles` length to 0. If
       * overriden ensure that `super.onEmpty()` is run.
       *
       * See {##initObservers}
       **/
      api.protoProperty('handles', {intro() {
        /**
         * An array to store any handles that should be stopped when the union is empty. A handle
         * is anything that has a `stop` method.
         **/
      }});
      api.protoMethod();
      const sub = new Publication({id: 'sub1', conn});
      //[
      const union = new Union();
      const onEmpty = spy(union, 'onEmpty');
      union.addSub(sub);
      union.removeSub(sub);
      assert.called(onEmpty);
      //]
    });

    test("initObservers", ()=>{
      /**
       * Override this method to start observers when one or more subscribers are added.  the
       * {##onEmpty} method should be overriden to stop any handles not stored in the
       * `handles` array property.
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
      class MyUnion extends Union {
        onEmpty() {
          super.onEmpty();
          for (const handle of this.handles)
            handle.stop();
        }

        initObservers() {
          const batchUpdate = this.buildBatchUpdate();

          this.handles.push(Book.onChange(batchUpdate));
        }
      }
      const union = new MyUnion();

      const initObservers = spy(union, 'initObservers');
      const onEmpty = spy(union, 'onEmpty');

      const sub1 = new Publication({id: 'sub1', conn: conn1});
      union.addSub(sub1);
      const sub2 = new Publication({id: 'sub2', conn: conn2});
      union.addSub(sub2);

      union.removeSub(sub1);

      assert.calledOnce(initObservers);
      refute.called(onEmpty);

      union.removeSub(sub2);
      assert.calledOnce(onEmpty);
      //]

      union.addSub(sub2);
      assert.calledTwice(initObservers);
      union.removeSub(sub2);
      assert.calledTwice(onEmpty);
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

      class MyUnion extends Union {
        loadInitial(addDoc, discreteLastSubscribed) {
          Book.query.forEach(addDoc);
        }
      }
      const union = new MyUnion();

      const sub = new Publication({id: 'sub1', conn});
      union.addSub(sub);

      const msgs = mc.decodeLastSend();

      assert.equals(msgs, [
        ['A', ['Book', {_id: 'book1', name: 'Book 1'}]],
        ['A', ['Book', {_id: 'book2', name: 'Book 2'}]]
      ]);
      //]
    });

    test("sendEncoded", ()=>{
      /**
       * Send a pre encoded {#koru/session/message} to all subscribers. Called by {##batchUpdate}.
       *
       * See {#koru/session/server-connection#sendEncoded}
       **/
      api.protoMethod();

      const conn2 = PublishTH.mockConnection('sess124');

      const union = new Union();

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

    test("buildUpdate", ()=>{
      /**
       * Override this to manipulate the document sent to clients. By default calls
       * {#koru/session/server-connection.buildUpdate}.
       **/
      api.protoMethod();

      const db = new MockDB(['Book']);

      const {Book} = db.models;

      //[
      class MyUnion extends Union {
        buildUpdate(dc) {
          const upd = super.buildUpdate(dc);
          if (upd[0] === 'C')
            upd[1][2].name = 'filtered';
          return upd;
        }
      }
      const union = new MyUnion();
      const book1 = Book.create();

      assert.equals(
        union.buildUpdate(DocChange.change(book1, {name: 'old name'})),
        ['C', ['Book', 'book1', {name: 'filtered'}]]
      );
      //]
    });

    test("buildBatchUpdate", ()=>{
      /**
       * buildBatchUpdate builds the {##batchUpdate} function that can be used to broadcast document
       * updates to multiple client subscriptions. It is called during Union construction.
       **/
      api.protoMethod();
      //[
      class MyUnion extends Union {
      }
      const union = new MyUnion();
      assert.isFunction(union.batchUpdate);
      //]
    });

    test("batchUpdate", ()=>{
      /**
       * The batchUpdate function is built by the {##buildBatchUpdate} method on Union
       * construction. It is used to broadcast document updates to multiple client subscriptions. It
       * does not need a `this` argument.
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

      class MyUnion extends Union {
        initObservers() {
          /**       ⏿ here we pass the batchUpdate ⮧ **/
          this.handles.push(Book.onChange(this.batchUpdate));
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
        ['A', ['Book', {_id: 'book3', name: 'Book 3'}]],
        ['R', ['Book', 'book2', void 0]]
      ]);
      //]
    });
  });
});

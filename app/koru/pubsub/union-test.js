isServer && define((require, exports, module) => {
  'use strict';
  /**
   * Union is an interface used to combine server subscriptions to minimise work on the server.
   *
   **/
  const koru            = require('koru');
  const Future          = require('koru/future');
  const dbBroker        = require('koru/model/db-broker');
  const DocChange       = require('koru/model/doc-change');
  const TransQueue      = require('koru/model/trans-queue');
  const MockConn        = require('koru/pubsub/mock-conn');
  const MockDB          = require('koru/pubsub/mock-db');
  const Publication     = require('koru/pubsub/publication');
  const Session         = require('koru/session');
  const ConnTH          = require('koru/session/conn-th-server');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util, intercept, stubProperty, match: m} = TH;

  const Union = require('./union');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let conn, origQ, events;

    const syncPoint = async (marker, lookfor) => {
      events.push(marker);
      let j = 0;
      let i = events.length;
      while (true) {
        while (events.length == i) {
          if (++j > 100) {
            koru.info('events: ' + events.join('\n'));
            throw new Error('Event not found: ' + lookfor);
          }
          await 1;
        }
        for (;i < events.length; ++i) {
          if (events[i] === lookfor) return;
        }
      }
    };

    beforeEach(() => {
      origQ = Session._commands.Q;
      conn = ConnTH.mockConnection('conn1');
    });

    afterEach(() => {
      ConnTH.stopAllSubs(conn);
      Session._commands.Q = origQ;
    });

    test('constructor', () => {
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

    test('addSub', async () => {
      /**
       * Add a subscriber to a union. This will cause {##loadInitial} to be run for the subscriber.
       *
       * For performance, if other subscribers are added to the union then they will be added to the
       * same loadQueue (if still running) as a previous subscriber if and only if their
       * {#../publication.discreteLastSubscribed} is the same as a previous subscriber and their
       * {#../publication;#lastSubscribed} is greater than the `minLastSubscribed` passed to
       * `loadInitial`; otherwise a new loadInitial will be run.
       *
       * It is important to note that addSub blocks the thread and queues batchUpdate until
       * loadInitial has finished. This ensures that the initial load will be sent before any
       * changes during the load.

       * @param sub the subscriber to add

       * @param [lastSubscribed] when sub last subscribed (in ms). Defaults to
       * {#../publication;#lastSubscribed}
       **/
      api.protoMethod();

      const db = new MockDB(['Book']);
      const mc = new MockConn(conn);

      const {Book} = db.models;
      Book.where = stub().returns(Book.query);

      //[
      const book1 = await Book.create();
      const book2 = await Book.create();

      class MyUnion extends Union {
        constructor(author_id) {
          super();
          this.author_id = author_id;
        }
        async loadInitial(encoder) {
          await Book.where('author_id', this.author_id).forEach((doc) => {encoder.addDoc(doc)});
        }
      }
      const union = new MyUnion('a123');

      const sub = new Publication({id: 'sub1', conn, lastSubscribed: void 0});
      /** ⏿ ⮧ here we add the sub **/
      await union.addSub(sub);

      const msgs = mc.decodeLastSend();

      assert.equals(msgs, [
        ['A', ['Book', {_id: 'book1', name: 'Book 1'}]],
        ['A', ['Book', {_id: 'book2', name: 'Book 2'}]],
      ]);
      //]

      {
        const loadInitial = stub(MyUnion.prototype, 'loadInitial');
        const now = Date.now();
        const sub = new Publication({id: 'sub1', conn, lastSubscribed: now - 2 * util.DAY});
        const lastSubscribed = now - 1 * util.DAY;
        await union.addSub(sub, lastSubscribed);

        assert.calledWith(loadInitial, m((e) => e.encode), lastSubscribed);
      }
    });

    test('addSubByToken', async () => {
      /**
       * Like {##addSub} but instead of using lastSubscribed to group for {##loadInitial} the token
       * is used to group for {##loadByToken}. The token can be anything is compared sameness.
       *
       * This is useful when critera changes such as permisssions which causes a `sub` to change
       * unions which requires some records to be removed from the client and some new records to be
       * added. Usually the client will automatically handle the removes but the adds will need to
       * be calculated based on the new and old unions. The token should contain the information
       * needed to calculate the subset.
       *
       **/
      api.protoMethod();

      const db = new MockDB(['Book']);
      const mc = new MockConn(conn);

      const {Book} = db.models;
      const forEach = async (callback) => {await callback(book2)};
      const whereNot = stub().returns({forEach});
      Book.where = stub().returns({whereNot});

      //[
      const book1 = await Book.create({genre_ids: ['drama', 'comedy']});
      const book2 = await Book.create({genre_ids: ['drama']});

      class MyUnion extends Union {
        constructor(genre_id) {
          super();
          this.genre_id = genre_id;
        }
        async loadByToken(encoder, oldUnion) {
          await Book
            .where('genre_ids', this.genre_id)
            .whereNot('genre_ids', oldUnion.genre_id)
            .forEach((doc) => {encoder.addDoc(doc)});
        }
      }
      const oldUnion = new MyUnion('comedy');
      const union = new MyUnion('drama');

      const sub = new Publication({id: 'sub1', conn, lastSubscribed: void 0});
      /** ⏿ ⮧ here we add the sub **/
      await union.addSubByToken(sub, oldUnion);

      const msgs = mc.decodeLastSend();

      assert.equals(msgs, [
        ['A', ['Book', book2.attributes]],
      ]);
      //]
      assert.calledWith(Book.where, 'genre_ids', 'drama');
      assert.calledWith(whereNot, 'genre_ids', 'comedy');
    });

    test('addSub partitions based on discreteLastSubscribed', async () => {
      let now = + new Date(2019, 1, 1); intercept(util, 'dateNow', () => now);

      now = Math.floor(now / Publication.lastSubscribedInterval) * Publication.lastSubscribedInterval;
      const conn1 = conn;
      const conn2 = ConnTH.mockConnection('conn2');
      const conn3 = ConnTH.mockConnection('conn3');
      const conn4 = ConnTH.mockConnection('conn4');
      const conn5 = ConnTH.mockConnection('conn5');

      const db = new MockDB(['Book']);
      const mc = new MockConn(conn);

      const {Book} = db.models;
      const book1 = await Book.create();
      const book2 = await Book.create();

      events = [];

      class MyUnion extends Union {
        constructor() {
          super();
        }

        async loadInitial(encoder, minLastSubscribed) {
          events.push(`li`, minLastSubscribed - now);
          await Book.query.forEach((doc) => {encoder.addDoc(doc)});
          events.push(`liDone`);
        }
      }
      const union = new MyUnion();

      const newSub = (id, conn, lastSubscribed) => {
        const sub = new Publication({id, conn, lastSubscribed});

        koru.runFiber(async () => {
          await union.addSub(sub);
          events.push('done' + sub.id);
        });
        return sub;
      };

      const sub1 = newSub('sub1', conn1, now);
      const sub2 = newSub('sub2', conn2, now + 30000);
      const sub3 = newSub('sub3', conn3, now - 1);
      const sub4 = newSub('sub4', conn4, now - 60000);
      const sub5 = newSub('sub5', conn5, now - 1 - Publication.lastSubscribedInterval);

      assert.same(union.count, 5);

      await syncPoint('wait1', 'liDone');
      refute.called(conn1.sendEncoded);
      refute.called(conn2.sendEncoded);

      await syncPoint('wait2', 'donesub1');
      assert.called(conn1.sendEncoded);
      assert.called(conn2.sendEncoded);
      refute.called(conn3.sendEncoded);
      refute.called(conn4.sendEncoded);

      await syncPoint('wait3', 'donesub3');
      assert.called(conn3.sendEncoded);
      assert.called(conn4.sendEncoded);
      refute.called(conn5.sendEncoded);

      await syncPoint('wait4', 'donesub5');
      assert.calledOnce(conn1.sendEncoded);
      assert.calledOnce(conn3.sendEncoded);
      assert.called(conn5.sendEncoded);

      assert.equals(events, [
        'wait1',
        'li', 0,
        'liDone',
        'wait2',

        'li', -60000,
        'donesub2',

        'liDone',
        'donesub1',
        'wait3',
        'li', -1 - Publication.lastSubscribedInterval,
        'donesub3',

        'liDone',
        'donesub4',
        'wait4',
        'donesub5']);

      union.removeSub(sub1);
      union.removeSub(sub3);
      assert.same(union.count, 3);

      union.removeSub(sub3);
      assert.same(union.count, 3);
    });

    test('addSubByToken partitions based on token', async () => {
      const conn1 = conn;
      const conn2 = ConnTH.mockConnection('conn2');
      const conn3 = ConnTH.mockConnection('conn3');
      const conn4 = ConnTH.mockConnection('conn4');
      const conn5 = ConnTH.mockConnection('conn5');

      const db = new MockDB(['Book']);
      const mc = new MockConn(conn);

      const {Book} = db.models;
      const book1 = await Book.create();
      const book2 = await Book.create();

      events = [];

      class MyUnion extends Union {
        async loadByToken(encoder, token) {
          events.push(`li`, token);
          await Book.query.forEach(encoder.addDoc.bind(encoder));
          events.push(`liDone`);
        }
      }
      const union = new MyUnion();

      const newSub = (id, conn, token) => {
        const sub = new Publication({id, conn});
        koru.runFiber(async () => {
          await union.addSubByToken(sub, token);
          events.push('done' + sub.id);
        });
        return sub;
      };

      const sub1 = newSub('sub1', conn1, 'token1');
      const sub2 = newSub('sub2', conn2, 'token1');
      const sub3 = newSub('sub3', conn3, 'token2');
      const sub4 = newSub('sub4', conn4, 'token2');
      const sub5 = newSub('sub5', conn5, 'token3');

      assert.same(union.count, 5);

      await syncPoint('wait1', 'liDone');

      refute.called(conn1.sendEncoded);
      refute.called(conn2.sendEncoded);

      await syncPoint('wait2', 'donesub1');
      assert.called(conn1.sendEncoded);
      assert.called(conn2.sendEncoded);
      refute.called(conn3.sendEncoded);
      refute.called(conn4.sendEncoded);

      await syncPoint('wait3', 'donesub3');
      assert.called(conn4.sendEncoded);
      assert.called(conn3.sendEncoded);
      refute.called(conn5.sendEncoded);

      await syncPoint('wait4', 'donesub5');
      assert.calledOnce(conn1.sendEncoded);
      assert.calledOnce(conn3.sendEncoded);
      assert.called(conn5.sendEncoded);

      assert.equals(events, [
        'wait1',
        'li', 'token1',
        'liDone',
        'wait2',

        'li', 'token2',
        'donesub2',

        'liDone',
        'donesub1',

        'wait3',
        'li', 'token3',
        'donesub4',

        'liDone',
        'donesub3',
        'wait4',
        'donesub5']);

      union.removeSub(sub5);
      union.removeSub(sub5);

      assert.same(union.count, 4);
    });

    test('removeSub', async () => {
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
      const book1 = await Book.create();
      const book2 = await Book.create();

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
        }

        stop() {
          super.stop();
          /** ⏿ ⮧ here we remove the sub **/
          union.removeSub(this);
        }
      }

      const sub = new MyPub({id: 'sub1', conn, lastSubscribed: void 0});
      await union.addSub(sub);

      sub.stop();

      assert.isTrue(onEmptyCalled);
      //]
    });

    test('onEmpty', async () => {
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
      await union.addSub(sub);
      union.removeSub(sub);
      assert.called(onEmpty);
      //]
    });

    test('initObservers', async () => {
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
      const conn2 = ConnTH.mockConnection('conn2');

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
      await union.addSub(sub1);
      const sub2 = new Publication({id: 'sub2', conn: conn2});
      await union.addSub(sub2);

      union.removeSub(sub1);

      assert.calledOnce(initObservers);
      refute.called(onEmpty);

      union.removeSub(sub2);
      assert.calledOnce(onEmpty);
      //]

      await union.addSub(sub2);
      assert.calledTwice(initObservers);
      union.removeSub(sub2);
      assert.calledTwice(onEmpty);
    });

    test('loadInitial', async () => {
      /**
       * Override this method to select the initial documents to download when a new group of
       * subscribers is added. Subscribers are partitioned by their
       * {#../publication.discreteLastSubscribed} time.

       * @param encoder an object that has methods `addDoc`, `remDoc` and `push`:

       * * `addDoc` is a function to call with a doc to be added to the subscribers.

       * * `chgDoc` is a function to call with a doc and change object (listing the fields that have
       changed) to be changed to the subscribers.

       * * `remDoc` a function to call with a doc (and optional flag) to be removed from the
       * subscribers. The flag is sent to the client as a {#koru/model/doc-change;#flag} which
       * defaults to "serverUpdate". A Useful value is "stopped" which a client persistence manager
       * can used to decide to not remove the persitent document.

       * * `push` is for adding any `message` to the batch. The message format is:

       * `[type, data]` (see {#koru/session/server-connection.buildUpdate} for examples).

       * @param minLastSubscribed the lastSubscribed time related to the first subscriber for this
       * load request. Only subscribers with a lastSubscribed >= first subscriber will be added to
       * the load.
       **/
      api.protoMethod();
      const db = new MockDB(['Book']);
      const mc = new MockConn(conn);
      const conn2 = ConnTH.mockConnection('conn2');
      const mc2 = new MockConn(conn2);

      const {Book} = db.models;
      let now = Date.now();
      //[
      const book1 = await Book.create({updatedAt: new Date(now - 80000)});
      const book2 = await Book.create({updatedAt: new Date(now - 40000)});
      const book3 = await Book.create({updatedAt: new Date(now - 50000), state: 'D'});
      const book4 = await Book.create({updatedAt: new Date(now - 31000), state: 'C'});//]
      Book.whereNot = stub().returns({async forEach(cb) {
        cb(book1); cb(book2); cb(book4);
      }});
      Book.where = stub().returns({async forEach(cb) {
        cb(book2); cb(book3); cb(book4);
      }});
      //[#

      class MyUnion extends Union {
        async loadInitial(encoder, minLastSubscribed) {
          const addDoc = encoder.addDoc.bind(encoder);
          const chgDoc = encoder.chgDoc.bind(encoder);
          const remDoc = encoder.remDoc.bind(encoder);
          if (minLastSubscribed == 0) {
            await Book.whereNot({state: 'D'}).forEach(addDoc);
          } else {
            await Book.where({updatedAt: {$gte: new Date(minLastSubscribed)}}).forEach((doc) => {
              switch (doc.state) {
              case 'D': remDoc(doc); break;
              case 'C': chgDoc(doc, {state: doc.state}); break;
              default: addDoc(doc);
              }
            });
          }
        }
      }
      const union = new MyUnion();

      const sub1 = new Publication({id: 'sub1', conn}); // no lastSubscribed
      await union.addSub(sub1);

      assert.equals(mc.decodeLastSend(), [
        ['A', ['Book', book1.attributes]],
        ['A', ['Book', book2.attributes]],
        ['A', ['Book', book4.attributes]],
      ]);

      const lastSubscribed = now - 600000;

      const sub2 = new Publication({id: 'sub2', conn: conn2, lastSubscribed});
      await union.addSub(sub2);
      assert.equals(mc2.decodeLastSend(), [
        ['A', ['Book', book2.attributes]],
        ['R', ['Book', 'book3', void 0]],
        ['C', ['Book', 'book4', {state: 'C'}]],
      ]);
      //]
    });

    test('loadInitial change with no send', async () => {
      class MyUnion extends Union {
        loadInitial(encoder) {}
      }

      const union = new MyUnion();

      const sub1 = new Publication({id: 'sub1', conn});

      await union.addSub(sub1);

      refute.called(sub1.conn.sendEncoded);
    });

    test('loadByToken', async () => {
      /**
       * Like {##loadInitial} but instead of using minLastSubscribed passes the token from
       * {##addSubByToken} to calculate which documents to load.

       * @param encoder an encoder object; see {##loadInitial}

       * @param token from {##addSubByToken}. Usually an old union the subscriptions belonged to.
       **/
      api.protoMethod();

      const db = new MockDB(['Book']);
      const mc = new MockConn(conn);

      const {Book} = db.models;

      const book1 = await Book.create();
      const book2 = await Book.create();

      //[
      // see addSubByToken for better example
      class MyUnion extends Union {
        /** ⏿ ⮧ here we loadByToken **/
        async loadByToken(encoder, token) {
          if (token === 'myToken') {
            encoder.addDoc(book1);
            encoder.remDoc(book2, 'stopped');
          }
        }
      }

      const union = new MyUnion();

      const sub1 = new Publication({id: 'sub1', conn});

      await union.addSubByToken(sub1, 'myToken');

      const msgs = mc.decodeLastSend();

      assert.equals(msgs, [
        ['A', ['Book', book1.attributes]],
        ['R', ['Book', book2._id, 'stopped']],
      ]);
      //]
    });

    test('loadByToken change with no send', async () => {
      class MyUnion extends Union {
        loadByToken(encoder, token) {}
      }

      const union = new MyUnion();

      const sub1 = new Publication({id: 'sub1', conn});

      await union.addSubByToken(sub1, 'myToken');

      refute.called(sub1.conn.sendEncoded);
    });

    test('loadInitial queues batchUpdates', async () => {
      let now = util.dateNow();
      now = Math.floor(now / Publication.lastSubscribedInterval) * Publication.lastSubscribedInterval;

      const db = new MockDB(['Book']);
      const mc = new MockConn(conn);

      const {Book} = db.models;
      const book1 = await Book.create();
      const book2 = await Book.create();

      events = [];

      class MyUnion extends Union {
        constructor() {
          super();
          this.future = new Future();
        }
        initObservers() {
          this.handles.push(Book.onChange(this.batchUpdate));
        }
        async loadInitial(encoder) {
          events.push(`li`);
          await this.future.promise;
          await Book.query.forEach((doc) => {encoder.addDoc(doc)});
          events.push(`liDone`);
        }
      }
      const union = new MyUnion();

      const sub = new Publication({id: 'sub1', conn});
      koru.runFiber(async () => {
        await union.addSub(sub);
        events.push('done' + sub.id);
      });

      await db.change(book1);

      refute.called(conn.sendEncoded);

      union.future.resolve();

      await syncPoint('wait1', 'donesub1');

      assert.calledTwice(conn.sendEncoded);
      assert.equals(mc.decodeMessage(conn.sendEncoded.firstCall.args[0]), [
        ['A', ['Book', book1.attributes]],
        ['A', ['Book', book2.attributes]],
      ]);
      assert.equals(String.fromCharCode(conn.sendEncoded.lastCall.args[0][0]), 'C');
      assert.equals(mc.decodeMessage(conn.sendEncoded.lastCall.args[0]), [
        'Book', 'book1', {name: 'name change'}]);
    });

    test('addSub adds to running partition', async () => {
      let now = + new Date(2019, 1, 1); intercept(util, 'dateNow', () => now);

      now = Math.floor(now / Publication.lastSubscribedInterval) * Publication.lastSubscribedInterval;
      const conn1 = conn;
      const conn2 = ConnTH.mockConnection('conn2');
      const conn3 = ConnTH.mockConnection('conn3');
      const conn4 = ConnTH.mockConnection('conn4');
      const conn5 = ConnTH.mockConnection('conn5');

      const db = new MockDB(['Book']);
      const mc = new MockConn(conn);

      const {Book} = db.models;
      const book1 = await Book.create();
      const book2 = await Book.create();

      events = [];

      class MyUnion extends Union {
        constructor() {
          super();
        }
        async loadInitial(encoder, minLastSubscribed) {
          events.push(`li`, minLastSubscribed - now);
          await Book.query.forEach(encoder.addDoc.bind(encoder));
          events.push(`liDone`);
        }
      }
      const union = new MyUnion();

      const newSub = (id, conn, lastSubscribed) => {
        const sub = new Publication({id, conn, lastSubscribed});
        koru.runFiber(async () => {
          await union.addSub(sub);
          events.push('done' + sub.id);
        });
        return sub;
      };

      newSub('sub1', conn1, now + 10000);
      newSub('sub2', conn2, now + 30000);
      newSub('sub3', conn3, now + 5000);
      newSub('sub4', conn4, now - 60000);
      newSub('sub5', conn5, now + 4000);

      await syncPoint('wait1', 'liDone');

      refute.called(conn1.sendEncoded);
      refute.called(conn2.sendEncoded);

      await syncPoint('wait2', 'donesub2');
      assert.called(conn1.sendEncoded);
      assert.called(conn2.sendEncoded);
      refute.called(conn3.sendEncoded);
      refute.called(conn4.sendEncoded);
      refute.called(conn5.sendEncoded);

      await syncPoint('wait3', 'donesub5');
      assert.called(conn3.sendEncoded);
      assert.called(conn5.sendEncoded);
      refute.called(conn4.sendEncoded);

      await syncPoint('wait4', 'donesub4');
      assert.called(conn4.sendEncoded);

      assert.equals(events, [
        'wait1',
        'li', 10000,
        'liDone',
        'wait2',

        'li', 4000,
        'donesub2',

        'liDone',
        'donesub1',
        'wait3',
        'li', -60000,
        'donesub3',

        'liDone',
        'donesub5',
        'wait4',
        'donesub4']);
    });

    test('encodeUpdate', async () => {
      /**
       * encode a {#koru/model/doc-change} ready for sending via {##sendEncoded} or
       * {##sendEncodedWhenIdle}.
       *
       * See {#koru/session/server-connection#buildUpdate}

       * @param dc for the document that has been updated

       * @returns an encoded (binary) update command
       **/
      api.protoMethod();

      const db = new MockDB(['Book']);
      const {Book} = db.models;

      const union = new Union();

      //[
      const sub1 = new Publication({id: 'sub123', conn});
      await union.addSub(sub1);
      const book1 = await Book.create();

      const msg = union.encodeUpdate(DocChange.change(book1, {name: 'old name'}));

      assert.equals(msg[0], 67); /* 'C' */ // is a Change command
      assert.equals(ConnTH.decodeMessage(msg, conn), ['Book', 'book1', {name: 'Book 1'}]);
      //]
    });

    test('sendEncoded', async () => {
      /**
       * Send a pre-encoded {#koru/session/message} to all subscribers. Called by {##batchUpdate}.
       *
       * See {#koru/session/server-connection#sendEncoded}

       * @param msg the pre-encoded message
       **/
      api.protoMethod();

      const conn2 = ConnTH.mockConnection('sess124');

      const union = new Union();

      //[
      const sub1 = new Publication({id: 'sub123', conn});
      await union.addSub(sub1);
      const sub2 = new Publication({id: 'sub124', conn: conn2});
      await union.addSub(sub1);
      await union.addSub(sub2);

      union.sendEncoded('myEncodedMessage');

      assert.calledWith(conn.sendEncoded, 'myEncodedMessage');
      assert.calledWith(conn2.sendEncoded, 'myEncodedMessage');
      //]
    });

    test('sendEncodedWhenIdle', async () => {
      /**
       * Delays calling {##sendEncoded} until {##loadInitial} and {##loadByToken} have finished
       **/
      api.protoMethod();
      //[
      const union = new Union();
      union.sendEncoded = stub();
      let callCount;

      union.loadInitial = () => {
        union.sendEncodedWhenIdle('msg1');
        callCount = union.sendEncoded.callCount;
      };

      const sub1 = new Publication({id: 'sub123', conn});
      await union.addSub(sub1);

      assert.same(callCount, 0);
      assert.calledOnceWith(union.sendEncoded, 'msg1');

      union.sendEncodedWhenIdle('msg2');
      assert.calledWith(union.sendEncoded, 'msg2');
      //]
    });

    test('subs', async () => {
      /**
       * Return an iterator over the union's subs.
       *
       **/
      api.protoMethod();

      const conn2 = ConnTH.mockConnection('sess124');

      const union = new Union();

      //[
      const sub1 = new Publication({id: 'sub123', conn});
      await union.addSub(sub1);
      const sub2 = new Publication({id: 'sub124', conn: conn2});
      await union.addSub(sub2);

      assert.equals(Array.from(union.subs()), [sub1, sub2]);
      //]
    });

    test('buildUpdate', async () => {
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
          if (upd[0] === 'C') {
            upd[1][2].name = 'filtered';
          }
          return upd;
        }
      }
      const union = new MyUnion();
      const book1 = await Book.create();

      assert.equals(
        union.buildUpdate(DocChange.change(book1, {name: 'old name'})),
        ['C', ['Book', 'book1', {name: 'filtered'}]],
      );
      //]
    });

    test('buildBatchUpdate', () => {
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

    test('batchUpdate', async () => {
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
      const book1 = await Book.create();
      const book2 = await Book.create();

      class MyUnion extends Union {
        initObservers() {
          /**       ⏿ here we pass the batchUpdate ⮧ **/
          this.handles.push(Book.onChange(this.batchUpdate));
        }
      }
      const union = new MyUnion();

      const sub = new Publication({id: 's123', conn});
      await union.addSub(sub);

      await TransQueue.transaction(async () => {
        await db.change(book1);
        await Book.create();
        await db.remove(book2);
      });

      const msgs = mc.decodeLastSend();

      assert.equals(msgs, [
        ['C', ['Book', 'book1', {name: 'name change'}]],
        ['A', ['Book', {_id: 'book3', name: 'Book 3'}]],
        ['R', ['Book', 'book2', void 0]],
      ]);
      //]
    });

    test('multiple unions on one sub', async () => {
      const empty = [];
      class Union1 extends Union {
        onEmpty() {empty.push('union1')}
      }

      class Union2 extends Union {
        onEmpty() {empty.push('union2')}
      }

      const union11 = new Union1();
      const union12 = new Union1();
      const union2 = new Union2();
      const sub = new Publication({id: 's123', conn});

      await union11.addSub(sub);
      await union12.addSub(sub);
      await union2.addSub(sub);

      union12.removeSub(sub);
      union2.removeSub(sub);
      union11.removeSub(sub);

      assert.equals(empty.join(' '), 'union1 union2 union1');
    });
  });
});

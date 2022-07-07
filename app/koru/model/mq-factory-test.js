isServer && define((require, exports, module) => {
  'use strict';
  /**
   * Manage durable Message queues.
   **/
  const koru            = require('koru');
  const Future          = require('koru/future');
  const Model           = require('koru/model');
  const dbBroker        = require('koru/model/db-broker');
  const TransQueue      = require('koru/model/trans-queue');
  const Driver          = require('koru/pg/driver');
  const api             = require('koru/test/api');
  const TH              = require('./test-db-helper');

  const {private$} = require('koru/symbols');

  const {stub, spy, util, intercept, match: m, stubProperty} = TH;

  const MQFactory = require('./mq-factory');

  const {MQ} = MQFactory[private$];

  let v = {};

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let mqFactory;
    beforeEach(async () => {
      api.module();
      v.defDb = Driver.defaultDb;
      await TH.startTransaction(v.defDb);
      mqFactory = new MQFactory('_test_MQ');
    });

    afterEach(async () => {
      dbBroker.db = v.defDb;
      mqFactory.deregisterQueue('foo');
      mqFactory.stopAll();
      await TH.rollbackTransaction(v.defDb);
      mqFactory = null;
      v = {};
    });

    test('global registerQueue', () => {
      /**
       * Register an action with a queue

       * @param [module] unregister if module is unloaded. Not available if local is true

       * @param name the name of the queue

       * @param [retryInterval] number of ms to wait before retrying a failed action.
       Defaults to 60000. A value of -1 means don't retry

       * @param [local] defaults to false. If true register queue just the current database;
       * otherwise register the queue for all current and future databases.

       * @param action the action to run when a queued message is ready
       **/
      api.protoMethod('registerQueue');

      const doSomethingWith = stub();

      after(() => {mqFactory.deregisterQueue('bar')});

      //[
      mqFactory.registerQueue({name: 'foo', action(msg) {doSomethingWith(msg)}});
      mqFactory.registerQueue({
        module, name: 'bar', retryInterval: -1, action(msg) {doSomethingWith(msg)}});
      //]
      assert.exception(() => {mqFactory.registerQueue({name: 'foo', action(msg) {doSomethingWith(msg)}})});
      mqFactory.deregisterQueue('foo');
      refute.exception(() => {mqFactory.registerQueue({name: 'foo', action(msg) {doSomethingWith(msg)}})});
    });

    group('with multi-db', () => {
      beforeEach(async () => {
        v.altDb = await Driver.connect(v.defDb._url + " options='-c search_path=alt'", 'alt');
        await v.altDb.query('CREATE SCHEMA IF NOT EXISTS alt');
        await TH.startTransaction(v.altDb);
        dbBroker.db = v.defDb;
      });

      afterEach(async () => {
        if (v.altDb) {
          dbBroker.db = v.altDb;
          mqFactory.stopAll();
          await TH.rollbackTransaction(v.altDb);
          dbBroker.clearDbId();
          await v.altDb.query('DROP SCHEMA IF EXISTS alt CASCADE');
        }
        dbBroker.db = v.defDb;
        mqFactory.stopAll();
        mqFactory.deregisterQueue('bar');
      });

      test('_initTableSchema', async () => {
        const {dbs$} = MQFactory[private$];
        stub(dbBroker.db, 'query');
        stubProperty(mqFactory[dbs$].current, 'table', {value: {_name: 'Test_TABEL', _ensureTable: stub()}});
        await mqFactory._initTableSchema();
        const schema = dbBroker.db.query.args(0, 0);
        dbBroker.db.query.restore();
        assert.equals(schema, `
CREATE TABLE "Test_TABEL" (
    _id bigint NOT NULL,
    name text COLLATE pg_catalog."C" NOT NULL,
    "dueAt" timestamp without time zone,
    message jsonb
);

CREATE SEQUENCE "Test_TABEL__id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY "Test_TABEL" ALTER COLUMN _id
  SET DEFAULT nextval('"Test_TABEL__id_seq"'::regclass),
  ADD CONSTRAINT "Test_TABEL_pkey" PRIMARY KEY (_id);


CREATE UNIQUE INDEX "Test_TABEL_name_dueAt__id" ON "Test_TABEL"
  USING btree (name, "dueAt", _id);
`);
      });

      test('local registerQueue', async () => {
        mqFactory.registerQueue({name: 'bar', local: true, action(...args) {
          v.args = args;
          v.db = dbBroker.db;
        }});

        mqFactory.registerQueue({name: 'panda', local: true, action(...args) {}});

        stub(koru, 'setTimeout').onCall(0).returns(123).onCall(1).returns(456);
        stub(koru, 'clearTimeout');

        await mqFactory.getQueue('bar').add({message: 'hello'});
        await mqFactory.getQueue('panda').add({message: 'p1'});

        assert.equals((await mqFactory.getQueue('bar').peek())[0].message, 'hello');

        /** with alt db **/
        dbBroker.db = v.altDb;

        assert.same(mqFactory.getQueue('bar'), undefined);

        let altBarFuture = new Future();

        mqFactory.registerQueue({name: 'bar', local: true, action(...args) {
          v.altArgs = args;
          altBarFuture.resolve();
        }});

        assert.same(v.db, undefined);

        await koru.setTimeout.yieldAndReset(); // doesn't matter where yielded;
        dbBroker.db = v.altDb; // because we stubbed koru.setTimeout
        assert.same(v.args[0].message, 'hello');
        assert.same(v.db, v.defDb);

        /** queue to other bar **/
        await mqFactory.getQueue('bar').add({message: 'alt hello'});
        koru.setTimeout.yieldAndReset();
        await altBarFuture.promise;

        assert.equals(v.altArgs[0].message, 'alt hello');
        assert.same(v.db, v.defDb);


        /** back to orig db **/
        dbBroker.db = v.defDb;

        assert.same(v.args[1], mqFactory.getQueue('bar'));

        await mqFactory.getQueue('bar').add({message: 'middle'});
        await koru.setTimeout.yieldAndReset();
        assert.equals(v.args[0].message, 'middle');
        await mqFactory.getQueue('bar').add({message: 'goodbye'});

        const {table} = mqFactory.getQueue('bar').mqdb;

        /** purge, deregister **/
        koru.clearTimeout.reset();
        await mqFactory.getQueue('bar').purge();
        mqFactory.getQueue('panda').deregister();

        assert.same(await table.count({name: 'bar'}), 0);
        assert.calledWith(koru.clearTimeout, 123);
        assert.same(await table.count({name: 'panda'}), 1);
        assert.calledWith(koru.clearTimeout, 456);

        assert.same(mqFactory.getQueue('bar'), undefined);
        assert.same(mqFactory.getQueue('panda'), undefined);

        mqFactory.registerQueue({name: 'bar', local: true, action(...args) {}});
        const bar = mqFactory.getQueue('bar');
        spy(bar, 'deregister');
        mqFactory.deregisterQueue('bar');
        assert.same(await mqFactory.getQueue('bar'), undefined);
        assert.called(bar.deregister);


        /** can restart deregisterd queue **/

        koru.setTimeout.reset();
        koru.clearTimeout.reset();

        mqFactory.registerQueue({name: 'panda', local: true, retryInterval: 30*1000, async action(msg) {
          await 1;
          v.msg = msg;
        }});

        let now = util.dateNow(); intercept(util, 'dateNow', () => now);

        await mqFactory.getQueue('panda').init();

        assert.calledWith(koru.setTimeout, m.func, 30*1000);

        await koru.setTimeout.yieldAndReset();

        assert.equals(v.msg.message, 'p1');
      });

      test('start', async () => {
        /**
         * Start timers on all queues within current database with existing messages
         **/
        api.protoMethod('start');

        let now = util.dateNow(); intercept(util, 'dateNow', () => now);

        mqFactory.registerQueue({module, name: 'foo', action(args) {v.foo = [dbBroker.db, args]}});
        mqFactory.registerQueue({module, name: 'bar', action(args) {v.bar = [dbBroker.db, args]}});
        after(() => {mqFactory.deregisterQueue('bar')});

        stub(koru, 'clearTimeout');
        stub(koru, 'setTimeout').returns(123);

        await mqFactory.getQueue('foo').add({message: 'foo1'});
        await mqFactory.getQueue('foo').add({message: 'foo2'});
        await mqFactory.getQueue('bar').add({message: 'bar1'});

        dbBroker.db = v.altDb;

        await mqFactory.getQueue('foo').add({message: 'altfoo1'});

        mqFactory.stopAll();

        assert.equals(koru.clearTimeout.firstCall.args, [123]);
        assert.same(koru.clearTimeout.callCount, 3);

        koru.setTimeout.reset();
        koru.clearTimeout.reset();

        await mqFactory.start();

        const foodb = dbBroker.db = {name: 'foo'};

        assert.calledOnce(koru.setTimeout);

        await koru.setTimeout.yield();

        assert.equals(v.foo, [v.altDb, {_id: 1, dueAt: util.newDate(), message: 'altfoo1'}]);

        koru.setTimeout.reset();
        dbBroker.db = v.defDb;

        api.done();

        await mqFactory.start();

        assert.calledTwice(koru.setTimeout);

        dbBroker.db = v.altDb;

        await koru.setTimeout.lastCall.args[0]();
        await koru.setTimeout.firstCall.yield();

        assert.equals(v.foo, [v.defDb, {_id: 1, dueAt: util.newDate(), message: 'foo1'}]);
        assert.equals(v.bar, [v.defDb, {_id: 3, dueAt: util.newDate(), message: 'bar1'}]);

        assert.same(koru.setTimeout.callCount, 3);

        await koru.setTimeout.lastCall.yield();

        assert.equals(v.foo, [v.defDb, {_id: 2, dueAt: util.newDate(), message: 'foo2'}]);
      });

      test('getQueue', () => {
        /**
         * Get a message queue for current database

         * @param name the name of the queue

         * @return the message queue

         **/
        api.protoMethod('getQueue');

        //[
        mqFactory.registerQueue({module, name: 'foo', action: stub()});

        const queue = mqFactory.getQueue('foo');
        assert(queue);
        assert.same(mqFactory.getQueue('foo'), queue);
        assert.same(mqFactory.getQueue('bar'), undefined);

        dbBroker.db = v.altDb;

        const altQ = mqFactory.getQueue('foo');
        refute.same(altQ, queue);

        dbBroker.db = v.defDb;

        assert.same(mqFactory.getQueue('foo'), queue);
        //]
      });
    });

    group('MQ', () => {
      /**
       * The class for queue instances.
       *
       * See {#../mq-factory#getQueue}
       **/
      let mqApi;
      beforeEach(() => {
        stub(koru, 'clearTimeout');
        stub(koru, 'setTimeout');
        koru.setTimeout.invokes((c) => 120 + koru.setTimeout.callCount);
        mqFactory.registerQueue({
          module, name: 'foo', action(...args) {return v.action(...args)}, retryInterval: 300});

        mqApi = api.innerSubject(MQ);
      });

      test('creates table', async () => {
        const query = stub(dbBroker.db, 'query').returns(Promise.resolve([]));
        const q = mqFactory.getQueue('foo');

        stub(q.mqdb.table, '_ensureTable').invokes((c) => {
          c.thisValue._colMap = void 0;
          return Promise.resolve();
        });

        await q.init();

        assert.same(query.callCount, 2);

        assert.match(query.calls[0].args[0], /CREATE TABLE "_test_MQ"/);
      });

      test('add', async () => {
        /**
         * Add a message to the queue. The message is persisted.

         * @param [at] the time to wait before actioning the message. Defaults to now

         * @param message the message to action

         **/
        v.action = (...args) => {v.args = args};

        let now = util.dateNow(); intercept(util, 'dateNow', () => now);

        const queue = mqFactory.getQueue('foo');

        mqApi.protoMethod();

        //[
        await queue.add({dueAt: new Date(now + 30), message: {my: 'message'}});
        assert.calledWith(koru.setTimeout, m.func, 30);
        await queue.add({dueAt: new Date(now + 10), message: {another: 'message'}});
        assert.calledOnceWith(koru.clearTimeout, 121);
        assert.calledWith(koru.setTimeout, m.func, 10);

        assert.equals(await v.defDb.query('select * from "_test_MQ" order by "dueAt"'), [{
          _id: 2,
          name: 'foo',
          dueAt: new Date(now + 10),
          message: {another: 'message'},
        }, {
          _id: 1,
          name: 'foo',
          dueAt: new Date(now + 30),
          message: {my: 'message'},
        }]);
        //]

        assert.same(v.args, undefined);

        const call = koru.setTimeout.lastCall;
        koru.setTimeout.reset();
        now += 10;
        await call.yield();

        assert.equals(v.args, [{
          _id: 2,
          dueAt: new Date(now),
          message: {another: 'message'},
        }, queue]);

        assert.calledOnceWith(koru.setTimeout, m.func, 20);

        assert.equals(await v.defDb.query('select * from "_test_MQ" order by "dueAt"'), [{
          _id: 1,
          name: 'foo',
          dueAt: new Date(now + 20),
          message: {my: 'message'},
        }]);

        now += 30;
        await koru.setTimeout.yieldAndReset();

        refute.called(koru.setTimeout);

        assert.equals(v.args, [{
          _id: 1,
          dueAt: new Date(now - 10),
          message: {my: 'message'},
        }, queue]);

        assert.equals(await v.defDb.query('select * from "_test_MQ" order by "dueAt"'), []);
      });

      test('peek', async () => {
        /**
         * Look at messages at the front of the queue without removing them

         * @param maxResults the maximum number of messages to return. Defaults to 1.

         * @param dueAt if given limit resonses to at or before `dueAt`.

         * @returns an array of messages in queue order
         **/
        let now = util.dateNow(); intercept(util, 'dateNow', () => now);

        const queue = mqFactory.getQueue('foo');

        mqApi.protoMethod();

        //[
        await queue.add({dueAt: new Date(now + 30), message: {my: 'message'}});
        await queue.add({dueAt: new Date(now + 10), message: {another: 'message'}});

        assert.equals(await queue.peek(), [{
          _id: 2,
          dueAt: new Date(now + 10),
          message: {another: 'message'},
        }]);

        assert.equals(await queue.peek(3), [{
          _id: 2,
          dueAt: new Date(now + 10),
          message: {another: 'message'},
        }, {
          _id: 1,
          dueAt: new Date(now + 30),
          message: {my: 'message'},
        }]);

        assert.equals(await queue.peek(5, new Date(now + 10)), [{
          _id: 2,
          dueAt: new Date(now + 10),
          message: {another: 'message'},
        }]);
        //]
      });

      test('remove', async () => {
        /**
         * Remove a message.

         * @param _id the id of the message to remove.
         **/
        let now = util.dateNow(); intercept(util, 'dateNow', () => now);

        const queue = mqFactory.getQueue('foo');

        mqApi.protoMethod();
        //[
        await queue.add({dueAt: new Date(now + 10), message: {my: 'message'}});
        await queue.add({dueAt: new Date(now + 20), message: {another: 'message'}});

        await queue.remove(2);

        assert.equals(await queue.peek(5), [m.field('_id', 1)]);
        //]
      });

      test('bad queue Time', async () => {
        try {
          await mqFactory.getQueue('foo').add({dueAt: new Date(NaN)});
          assert.fail('expect throw');
        } catch (err) {
          assert.exception(err, {message: 'Invalid dueAt'});
        }
      });

      test('error in action', async () => {
        let now = util.dateNow(); intercept(util, 'dateNow', () => now);

        const queue = mqFactory.getQueue('foo');
        v.action = async (args) => {
          await 1;
          throw v.error = new Error('test error');
        };
        await queue.add({message: [1, 2]});

        stub(koru, 'unhandledException');

        await koru.setTimeout.yieldAndReset();

        assert.calledWith(koru.unhandledException, v.error);

        assert.calledWith(koru.setTimeout, m.func, 300);

        await queue.add({message: [1, 2, 3]});

        assert.calledOnce(koru.setTimeout);

        after(() => {mqFactory.deregisterQueue('bar')});
        mqFactory.registerQueue({name: 'bar', action: v.action, retryInterval: -1});

        await mqFactory.getQueue('bar').add({message: [4, 5, 6]});

        await koru.setTimeout.lastCall.yield();

        assert.same(koru.setTimeout.callCount, 2);

        assert.equals(queue.error, v.error);

        v.action = (args) => {v.args = args};

        await koru.setTimeout.firstCall.yield();

        assert.equals(queue.error, undefined);
        assert.equals(v.args.message, [1, 2]);

        await koru.setTimeout.lastCall.yield();
        assert.equals(v.args.message, [1, 2, 3]);
      });

      test('sendNow', async () => {
        /**
         * Skip any retry interval and send the message now if dueAt has passed.
         */
        mqApi.protoMethod();
        let now = util.dateNow(); intercept(util, 'dateNow', () => now);

        //[
        const queue = mqFactory.getQueue('foo');
        v.action = async (args) => {
          throw {retryAfter: 12345};
        };

        await queue.add({message: [1, 2]});
        await koru.setTimeout.yieldAndReset();
        assert.calledWith(koru.setTimeout, m.func, 12345);

        koru.setTimeout.reset();
        await queue.sendNow();
        assert.calledWith(koru.setTimeout, m.func, 0);
        //]

        /** on init */
        {
          mqFactory.stopAll();

          const queue = mqFactory.getQueue('foo');
          koru.setTimeout.reset();
          await queue.sendNow();
          assert.calledWith(koru.setTimeout, m.func, 0);
        }
      });

      test('retryAfter', async () => {
        let now = util.dateNow(); intercept(util, 'dateNow', () => now);

        const queue = mqFactory.getQueue('foo');
        v.action = async (args) => {
          throw {retryAfter: 12345};
        };

        await queue.add({message: [1, 2]});
        await koru.setTimeout.yieldAndReset();
        assert.calledWith(koru.setTimeout, m.func, 12345);
      });

      test('delay more than one day', async () => {
        let now = util.dateNow(); intercept(util, 'dateNow', () => now);

        stub(TransQueue, 'onSuccess');

        const queue = mqFactory.getQueue('foo');
        await queue.add({dueAt: new Date(now + 5 * util.DAY), message: [1]});

        assert.calledWith(TransQueue.onSuccess, m.func);
        refute.called(koru.setTimeout);
        TransQueue.onSuccess.yieldAndReset();
        assert.calledWith(koru.setTimeout, m.func, util.DAY);

        v.action = stub();

        await koru.setTimeout.yieldAndReset();

        refute.called(v.action);

        assert.calledWith(koru.setTimeout, m.func, util.DAY);

        now += 5 * util.DAY;

        await koru.setTimeout.yieldAndReset();

        assert.called(v.action);

        refute.called(koru.setTimeout);
      });

      test('queue from within action', async () => {
        let now = util.dateNow(); intercept(util, 'dateNow', () => now);

        const queue = mqFactory.getQueue('foo');
        v.action = async (args) => {
          v.action = (args) => {v.args = args};
          await queue.add({dueAt: new Date(now + 50), message: {last: 'msg'}});
          await queue.add({dueAt: new Date(now - 20), message: [1, 2, 3]});
        };

        await queue.add({message: [4, 5, 6]});

        await koru.setTimeout.yieldAndReset();
        assert.equals(v.args, void 0);
        assert.calledTwice(koru.setTimeout);

        await koru.setTimeout.yieldAndReset();

        assert.equals(v.args.message, [1, 2, 3]);

        now += 50;
        await koru.setTimeout.yieldAndReset();

        assert.equals(v.args.message, {last: 'msg'});
      });
    });
  });
});

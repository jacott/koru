isServer && define(function (require, exports, module) {
  /**
   * Manage durable Message queues.
   **/
  const koru            = require('koru');
  const Model           = require('koru/model');
  const dbBroker        = require('koru/model/db-broker');
  const Driver          = require('koru/pg/driver');
  const api             = require('koru/test/api');
  const TH              = require('./test-db-helper');

  const {stub, spy, onEnd, util, intercept} = TH;

  const MQFactory = require('./mq-factory');
  let v = null;

  let mqFactory;

  TH.testCase(module, {
    setUp() {
      api.module();
      v = {};
      v.defDb = Driver.defaultDb;
      TH.coreStartTransaction(v.defDb);
      mqFactory = new MQFactory('_test_MQ');
    },

    tearDown() {
      mqFactory.deregisterQueue('foo');
      mqFactory.stopAll();
      v.defDb.query(`drop table  if exists "_test_MQ"; drop sequence if exists "_test_MQ__id_seq";`);
      TH.coreRollbackTransaction(v.defDb);
      v = mqFactory = null;
    },

    "test global registerQueue"() {
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

      onEnd(()=>{mqFactory.deregisterQueue('bar')});

      //[
      mqFactory.registerQueue({name: 'foo', action(msg) {doSomethingWith(msg)}});
      mqFactory.registerQueue({
        module, name: 'bar', retryInterval: -1, action(msg) {doSomethingWith(msg)}});
      //]
      assert.exception(()=>{mqFactory.registerQueue({name: 'foo', action(msg) {doSomethingWith(msg)}})});
      mqFactory.deregisterQueue('foo');
      refute.exception(()=>{mqFactory.registerQueue({name: 'foo', action(msg) {doSomethingWith(msg)}})});
    },

    "with multi-db": {
      setUp() {
        dbBroker.db = v.defDb;
        v.altDb = Driver.connect(v.defDb._url + " options='-c search_path=alt'", 'alt');
        v.altDb.query('CREATE SCHEMA IF NOT EXISTS alt');
        TH.coreStartTransaction(v.altDb);
      },

      tearDown() {
        mqFactory.deregisterQueue('foo');
        if (v.altDb) {
          TH.coreRollbackTransaction(v.altDb);
          v.altDb.query("DROP SCHEMA IF EXISTS alt CASCADE");
          dbBroker.clearDbId();
        }
      },

      "test local registerQueue"() {
        mqFactory.registerQueue({name: 'bar', local: true, action(...args) {
          v.args = args;
          v.db = dbBroker.db;
        }});

        mqFactory.registerQueue({name: 'panda', local: true, action(...args) {
        }});

        stub(koru, 'setTimeout').onCall(0).returns(123).onCall(1).returns(456);
        stub(koru, 'clearTimeout');

        mqFactory.getQueue('bar').add({message: 'hello'});
        mqFactory.getQueue('panda').add({message: 'p1'});

        assert.equals(mqFactory.getQueue('bar').peek()[0].message, 'hello');

        /** with alt db **/
        dbBroker.db = v.altDb;

        assert.same(mqFactory.getQueue('bar'), undefined);

        mqFactory.registerQueue({name: 'bar', local: true, action(...args) {
          v.altArgs = args;
        }});

        assert.same(v.db, undefined);
        koru.setTimeout.yieldAndReset(); // doesn't matter where yielded;
        dbBroker.db = v.altDb; // because we stubbed koru.setTimeout
        assert.same(v.args[0].message, 'hello');
        assert.same(v.db, v.defDb);

        /** queue to other bar **/
        mqFactory.getQueue('bar').add({message: 'alt hello'});
        koru.setTimeout.yieldAndReset();

        assert.equals(v.altArgs[0].message, 'alt hello');
        assert.same(v.db, v.defDb);

        /** back to orig db **/
        dbBroker.db = v.defDb;

        assert.same(v.args[1], mqFactory.getQueue('bar'));

        mqFactory.getQueue('bar').add({message: 'middle'});
        koru.setTimeout.yieldAndReset();
        assert.equals(v.args[0].message, 'middle');
        mqFactory.getQueue('bar').add({message: 'goodbye'});

        const {table} = mqFactory.getQueue('bar').mqdb;

        /** purge, deregister **/
        koru.clearTimeout.reset();
        mqFactory.getQueue('bar').purge();
        mqFactory.getQueue('panda').deregister();

        assert.same(table.count({name: 'bar'}), 0);
        assert.calledWith(koru.clearTimeout, 123);
        assert.same(table.count({name: 'panda'}), 1);
        assert.calledWith(koru.clearTimeout, 456);

        assert.same(mqFactory.getQueue('bar'), undefined);
        assert.same(mqFactory.getQueue('panda'), undefined);

        /** can restart deregisterd queue **/

        koru.setTimeout.reset();
        koru.clearTimeout.reset();

        mqFactory.registerQueue({name: 'panda', local: true, retryInterval: 30*1000, action(msg) {
          v.msg = msg;
        }});

        let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);

        assert(mqFactory.getQueue('panda'));

        assert.calledWith(koru.setTimeout, TH.match.func, 30*1000);

        koru.setTimeout.yieldAndReset();

        assert.equals(v.msg.message, 'p1');


      },

      "test start"() {
        /**
         * Start timers on all queues within current database with existing messages
         **/
        api.protoMethod('start');

        let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);

        mqFactory.registerQueue({module, name: 'foo', action(args) {v.foo = [dbBroker.db, args]}});
        mqFactory.registerQueue({module, name: 'bar', action(args) {v.bar = [dbBroker.db, args]}});
        onEnd(()=>{mqFactory.deregisterQueue('bar')});

        stub(koru, 'clearTimeout');
        stub(koru, 'setTimeout').returns(123);

        mqFactory.getQueue('foo').add({message: 'foo1'});
        mqFactory.getQueue('foo').add({message: 'foo2'});
        mqFactory.getQueue('bar').add({message: 'bar1'});

        dbBroker.db = v.altDb;

        mqFactory.getQueue('foo').add({message: 'altfoo1'});

        mqFactory.stopAll();

        assert.equals(koru.clearTimeout.firstCall.args, [123]);
        assert.same(koru.clearTimeout.callCount, 3);

        koru.setTimeout.reset();
        koru.clearTimeout.reset();

        mqFactory.start();

        const foodb = dbBroker.db = {name: "foo"};

        assert.same(koru.setTimeout.callCount, 1);

        koru.setTimeout.yield();

        assert.equals(v.foo, [v.altDb, {_id: 1, dueAt: util.newDate(), message: 'altfoo1'}]);

        koru.setTimeout.reset();
        dbBroker.db = v.defDb;

        api.done();

        mqFactory.start();

        assert.same(koru.setTimeout.callCount, 2);

        dbBroker.db = v.altDb;

        koru.setTimeout.lastCall.yield();
        koru.setTimeout.firstCall.yield();

        assert.equals(v.foo, [v.defDb, {_id: 1, dueAt: util.newDate(), message: 'foo1'}]);
        assert.equals(v.bar, [v.defDb, {_id: 3, dueAt: util.newDate(), message: 'bar1'}]);

        koru.setTimeout.lastCall.yield();

        assert.equals(v.foo, [v.defDb, {_id: 2, dueAt: util.newDate(), message: 'foo2'}]);
      },

      "test getQueue"() {
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
      },
    },

    "with queue": {
      setUp() {
        stub(koru, 'clearTimeout');
        stub(koru, 'setTimeout');
        koru.setTimeout
          .onCall(0).returns(121)
          .onCall(1).returns(122)
          .onCall(2).returns(123)
        ;

        mqFactory.registerQueue({
          module, name: 'foo', action(...args) {v.action(...args)}, retryInterval: 300});
      },

      "test creates table"() {
        const query = stub(dbBroker.db, 'query').returns([]);
        mqFactory.getQueue('foo');

        assert.same(query.callCount, 5);

        assert.equals(query.calls[3].args[0], `
CREATE TABLE "_test_MQ" (
    _id bigint NOT NULL,
    name text COLLATE pg_catalog."C" NOT NULL,
    "dueAt" timestamp without time zone,
    message jsonb
);

CREATE SEQUENCE "_test_MQ__id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY "_test_MQ" ALTER COLUMN _id
  SET DEFAULT nextval('_test_MQ__id_seq'::regclass),
  ADD CONSTRAINT "_test_MQ_pkey" PRIMARY KEY (_id);


CREATE UNIQUE INDEX "_test_MQ_name_dueAt__id" ON "_test_MQ"
  USING btree (name, "dueAt", _id);
`);
      },

      "test add message"() {
        /**
         * Add a message to the queue. The message is persisted.

         * @param [at] the time to wait before actioning the message. Defaults to now

         * @param message the message to action

         **/
        v.action = (...args)=>{v.args = args};

        let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);

        const queue = mqFactory.getQueue('foo');

        api.innerSubject(queue, 'MQ').method('add');

        queue.add({dueAt: new Date(now+30), message: {my: 'message'}});
        assert.calledWith(koru.setTimeout, TH.match.func, 30);
        queue.add({dueAt: new Date(now+10), message: {another: 'message'}});
        assert.calledOnceWith(koru.clearTimeout, 121);
        assert.calledWith(koru.setTimeout, TH.match.func, 10);

        assert.equals(v.defDb.query('select * from "_test_MQ" order by "dueAt"'), [{
          _id: 2,
          name: 'foo',
          dueAt: new Date(now+10),
          message: {another: 'message'},
        }, {
          _id: 1,
          name: 'foo',
          dueAt: new Date(now+30),
          message: {my: 'message'},
        }]);

        assert.same(v.args, undefined);

        const call = koru.setTimeout.lastCall;
        koru.setTimeout.reset();
        now+=10;
        call.yield();

        assert.equals(v.args, [{
          _id: 2,
          dueAt: new Date(now),
          message: {another: 'message'},
        }, queue]);

        assert.calledOnceWith(koru.setTimeout, TH.match.func, 20);

        assert.equals(v.defDb.query('select * from "_test_MQ" order by "dueAt"'), [{
          _id: 1,
          name: 'foo',
          dueAt: new Date(now+20),
          message: {my: 'message'},
        }]);

        now+=30;
        koru.setTimeout.yieldAndReset();

        refute.called(koru.setTimeout);

        assert.equals(v.args, [{
          _id: 1,
          dueAt: new Date(now-10),
          message: {my: 'message'},
        }, queue]);

        assert.equals(v.defDb.query('select * from "_test_MQ" order by "dueAt"'), []);
      },

      "test peek"() {
        /**
         * Look at messages at the front of the queue without removing them

         * @param maxResults the maximum number of messages to return. Defaults to 1.

         * @param dueAt if given limit resonses to at or before `dueAt`.

         * @returns an array of messages in queue order
         **/
        let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);

        const queue = mqFactory.getQueue('foo');

        api.innerSubject(queue, 'MQ').method('peek');

        queue.add({dueAt: new Date(now+30), message: {my: 'message'}});
        queue.add({dueAt: new Date(now+10), message: {another: 'message'}});

        assert.equals(queue.peek(), [{
          _id: 2,
          dueAt: new Date(now+10),
          message: {another: 'message'},
        }]);

        assert.equals(queue.peek(3), [{
          _id: 2,
          dueAt: new Date(now+10),
          message: {another: 'message'},
        }, {
          _id: 1,
          dueAt: new Date(now+30),
          message: {my: 'message'},
        }]);

        assert.equals(queue.peek(5, new Date(now+10)), [{
          _id: 2,
          dueAt: new Date(now+10),
          message: {another: 'message'},
        }]);
      },

      "test remove"() {
        /**
         * Remove a message.

         * @param _id the id of the message to remove.
         **/
        let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);

        const queue = mqFactory.getQueue('foo');

        api.innerSubject(queue, 'MQ').method('peek');

        queue.add({dueAt: new Date(now+10), message: {my: 'message'}});
        queue.add({dueAt: new Date(now+20), message: {another: 'message'}});

        queue.remove('2');

        assert.equals(queue.peek(5), [TH.match.field('_id', 1)]);
      },

      "test bad queue Time"() {
        assert.exception(()=>{
          mqFactory.getQueue('foo').add({dueAt: new Date(-4)});
        }, {message: 'Invalid dueAt'});
      },

      "test error in action"() {
        let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);

        const queue = mqFactory.getQueue('foo');
        v.action = (args)=>{
          throw v.error = new Error('test error');
        };
        queue.add({message: [1,2]});

        stub(koru, 'unhandledException');

        koru.setTimeout.yieldAndReset();

        assert.calledWith(koru.unhandledException, v.error);

        assert.calledWith(koru.setTimeout, TH.match.func, 300);

        queue.add({message: [1,2,3]});

        assert.calledOnce(koru.setTimeout);

        onEnd(()=>{mqFactory.deregisterQueue('bar')});
        mqFactory.registerQueue({name: 'bar', action: v.action, retryInterval: -1});

        mqFactory.getQueue('bar').add({message: [4,5,6]});

        koru.setTimeout.lastCall.yield();

        assert.same(koru.setTimeout.callCount, 2);

        assert.equals(queue.error, v.error);


        v.action = args => {v.args = args};

        koru.setTimeout.firstCall.yield();

        assert.equals(queue.error, undefined);
        assert.equals(v.args.message, [1,2]);

        koru.setTimeout.lastCall.yield();
        assert.equals(v.args.message, [1,2,3]);
      },

      "test retryAfter"() {
        let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);

        const queue = mqFactory.getQueue('foo');
        v.action = (args)=>{
          throw {retryAfter: 12345};
        };

        queue.add({message: [1,2]});
        koru.setTimeout.yieldAndReset();
        assert.calledWith(koru.setTimeout, TH.match.func, 12345);
      },

      "test delay more than one day"() {
        let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);

        const queue = mqFactory.getQueue('foo');
        queue.add({dueAt: new Date(now+5*util.DAY), message: [1]});

        assert.calledWith(koru.setTimeout, TH.match.func, util.DAY);

        v.action = stub();

        koru.setTimeout.yieldAndReset();

        refute.called(v.action);

        assert.calledWith(koru.setTimeout, TH.match.func, util.DAY);

        now+=5*util.DAY;

        koru.setTimeout.yieldAndReset();

        assert.called(v.action);

        refute.called(koru.setTimeout);
      },

      "test queue from within action"() {
        let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);

        const queue = mqFactory.getQueue('foo');
        v.action = (args)=>{
          v.action = args => {v.args = args};
          queue.add({dueAt: new Date(now+50), message: {last: 'msg'}});
          queue.add({dueAt: new Date(now-20), message: [1,2,3]});
        };

        queue.add({message: [4,5,6]});

        koru.setTimeout.yieldAndReset();
        assert.calledOnce(koru.setTimeout);
        koru.setTimeout.yieldAndReset();

        assert.equals(v.args.message, [1,2,3]);

        now+=50;
        koru.setTimeout.yieldAndReset();

        assert.equals(v.args.message, {last: 'msg'});
      },
    },

  });
});

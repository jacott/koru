isServer && define(function (require, exports, module) {
  const koru            = require('koru');
  const Model           = require('koru/model');
  const dbBroker        = require('koru/model/db-broker');
  const Driver          = require('koru/pg/driver');
  const api             = require('koru/test/api');
  const TH              = require('./test-db-helper');

  const {stub, spy, onEnd, util, intercept} = TH;

  const sut  = require('./message-queues');
  let v = null;

  TH.testCase(module, {
    setUpOnce() {
      v = {};
      v.defDb = Driver.defaultDb;
      TH.coreStartTransaction(v.defDb);
    },

    tearDownOnce() {
      v.defDb.query(`drop table  if exists _message_queue;
drop sequence if exists _message_queue__id_seq;
`);
      TH.coreRollbackTransaction(v.defDb);
      v = null;
    },

    setUp() {
      api.module();
      TH.startTransaction(v.defDb);
    },

    tearDown() {
      sut.deregisterQueue('foo');
      sut.stopAll();
      TH.rollbackTransaction(v.defDb);
    },

    "test registerQueue"() {
      /**
       * Register an action with a queue

       * @param [module] unregister if module is unloaded

       * @param name the name of the queue

       * @param [retryInterval] number of ms to wait before retrying a failed action.
       Defaults to 60000. A value of -1 means don't retry

       * @param action the action to run when a queued message is ready
       **/
      api.method('registerQueue');

      const doSomethingWith = stub();

      onEnd(()=>{sut.deregisterQueue('bar')});

      api.example(()=>{
        sut.registerQueue({name: 'foo', action(msg) {doSomethingWith(msg)}});
        sut.registerQueue({
          module, name: 'bar', retryInterval: -1, action(msg) {doSomethingWith(msg)}});
      });
      assert.exception(()=>{sut.registerQueue({name: 'foo', action(msg) {doSomethingWith(msg)}})});
      sut.deregisterQueue('foo');
      refute.exception(()=>{sut.registerQueue({name: 'foo', action(msg) {doSomethingWith(msg)}})});
    },

    "with multi-db": {
      setUpOnce() {
        v.altDb = Driver.connect(v.defDb._url + " options='-c search_path=alt'", 'alt');
        v.altDb.query('CREATE SCHEMA IF NOT EXISTS alt');
        TH.coreStartTransaction(v.altDb);
      },

      tearDownOnce() {
        if (v.altDb) {
          TH.coreRollbackTransaction(v.altDb);
          v.altDb.query("DROP SCHEMA IF EXISTS alt CASCADE");
          dbBroker.clearDbId();
        }
      },

      setUp() {
        TH.startTransaction(v.altDb);
        dbBroker.db = v.defDb;
      },

      tearDown() {
        sut.deregisterQueue('foo');
        TH.rollbackTransaction(v.altDb);
      },

      "test start"() {
        /**
         * Start timers on all queues within current database with existing messages
         **/
        api.method('start');

        let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);

        sut.registerQueue({module, name: 'foo', action(args) {v.foo = [dbBroker.db, args]}});
        sut.registerQueue({module, name: 'bar', action(args) {v.bar = [dbBroker.db, args]}});
        onEnd(()=>{sut.deregisterQueue('bar')});

        stub(koru, 'clearTimeout');
        stub(koru, 'setTimeout').returns(123);

        sut.getQueue('foo').add({message: 'foo1'});
        sut.getQueue('foo').add({message: 'foo2'});
        sut.getQueue('bar').add({message: 'bar1'});

        dbBroker.db = v.altDb;

        sut.getQueue('foo').add({message: 'altfoo1'});

        sut.stopAll();

        assert.equals(koru.clearTimeout.firstCall.args, [123]);
        assert.same(koru.clearTimeout.callCount, 3);

        koru.setTimeout.reset();
        koru.clearTimeout.reset();

        sut.start();

        const foodb = dbBroker.db = {name: "foo"};

        assert.same(koru.setTimeout.callCount, 1);

        koru.setTimeout.yield();

        assert.equals(v.foo, [v.altDb, {name: 'foo', dueAt: util.newDate(), message: 'altfoo1'}]);

        koru.setTimeout.reset();
        dbBroker.db = v.defDb;

        sut.start();

        assert.same(koru.setTimeout.callCount, 2);

        dbBroker.db = v.altDb;

        koru.setTimeout.lastCall.yield();
        koru.setTimeout.firstCall.yield();

        assert.equals(v.foo, [v.defDb, {name: 'foo', dueAt: util.newDate(), message: 'foo1'}]);
        assert.equals(v.bar, [v.defDb, {name: 'bar', dueAt: util.newDate(), message: 'bar1'}]);

        koru.setTimeout.lastCall.yield();

        assert.equals(v.foo, [v.defDb, {name: 'foo', dueAt: util.newDate(), message: 'foo2'}]);
      },

      "test getQueue"() {
        /**
         * Get a message queue for current database

         * @param name the name of the queue

         * @return the message queue

         **/
        sut.registerQueue({module, name: 'foo', action: stub()});
        const queue = sut.getQueue('foo');

        api.method('getQueue');

        assert(queue);
        assert.same(sut.getQueue('foo'), queue);
        refute.same(sut.getQueue('bar'), queue);

        dbBroker.db = v.altDb;

        const altQ = sut.getQueue('foo');
        refute.same(altQ, queue);

        dbBroker.db = v.defDb;

        assert.same(sut.getQueue('foo'), queue);
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

        sut.registerQueue({module, name: 'foo', action(msg) {v.action(msg)}, retryInterval: 300});
      },

      "test add message"() {
        /**
         * Add a message to the queue. The message is persisted.

         * @param [at] the time to wait before actioning the message. Defaults to now

         * @param message the message to action

         **/
        v.action = (args)=>{v.args = args};

        let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);

        const queue = sut.getQueue('foo');

        api.protoMethod('add');

        queue.add({dueAt: new Date(now+30), message: {my: 'message'}});
        assert.calledWith(koru.setTimeout, TH.match.func, 30);
        queue.add({dueAt: new Date(now+10), message: {another: 'message'}});
        assert.calledOnceWith(koru.clearTimeout, 121);
        assert.calledWith(koru.setTimeout, TH.match.func, 10);

        assert.equals(v.defDb.query('select * from _message_queue order by "dueAt"'), [{
          _id: '2',
          name: 'foo',
          dueAt: new Date(now+10),
          message: {another: 'message'},
        }, {
          _id: '1',
          name: 'foo',
          dueAt: new Date(now+30),
          message: {my: 'message'},
        }]);

        assert.same(v.args, undefined);

        const call = koru.setTimeout.lastCall;
        koru.setTimeout.reset();
        now+=10;
        call.yield();

        assert.equals(v.args, {
          name: 'foo',
          dueAt: new Date(now),
          message: {another: 'message'},
        });

        assert.calledOnceWith(koru.setTimeout, TH.match.func, 20);

        assert.equals(v.defDb.query('select * from _message_queue order by "dueAt"'), [{
          _id: '1',
          name: 'foo',
          dueAt: new Date(now+20),
          message: {my: 'message'},
        }]);

        now+=30;
        koru.setTimeout.yieldAndReset();

        refute.called(koru.setTimeout);

        assert.equals(v.args, {
          name: 'foo',
          dueAt: new Date(now-10),
          message: {my: 'message'},
        });

        assert.equals(v.defDb.query('select * from _message_queue order by "dueAt"'), []);
      },

      "test bad queue Time"() {
        assert.exception(()=>{
          sut.getQueue('foo').add({dueAt: new Date(-4)});
        }, {message: 'Invalid dueAt'});
      },

      "test error in action"() {
        let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);

        const queue = sut.getQueue('foo');
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

        onEnd(()=>{sut.deregisterQueue('bar')});
        sut.registerQueue({name: 'bar', action: v.action, retryInterval: -1});

        sut.getQueue('bar').add({message: [4,5,6]});

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

      "test delay more than one day"() {
        let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);

        const queue = sut.getQueue('foo');
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

        const queue = sut.getQueue('foo');
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

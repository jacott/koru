define(function (require, exports, module) {
  /**
   * Queue sequential asynchronous actions
   **/
  const api = require('koru/test/api');
  const TH  = require('./test-helper');

  const BusyQueue  = require('./busy-queue');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
      api.module();
    },

    tearDown() {
      v = null;
    },

    "test new"() {
      /**
       * Create a busy queue

       * @param [subject] this wil be passed to actions and busy/idle callbacks
       **/

      const new_BusyQueue = api.new(BusyQueue);

      refute(new_BusyQueue().isBusy);

      const bq = new_BusyQueue({});
      refute(bq.isBusy);

      bq.whenBusy = function (subject) {};
      bq.whenIdle = function (subject) {};
      api.protoProperty("whenBusy", () => "called with `subject` when queue is busy", bq);
      api.protoProperty("whenIdle", () => "called with `subject` when queue is idle", bq);
    },

    "test queueAction"() {
      /**
       * Queue an action; runs immediately if idle and calls `whenBusy`
       **/
      api.protoMethod('queueAction');

      const subject = {};

      const bq = new BusyQueue(subject);
      bq.whenBusy = this.stub();

      bq.queueAction(v.action = this.stub("action"));
      assert.calledWith(bq.whenBusy, subject);

      assert.calledWith(v.action, subject);
      assert(bq.isBusy);

      bq.queueAction(v.action2 = this.stub("action2"));
      refute.called(v.action2);
      bq.nextAction();
      assert(bq.isBusy);
      assert.called(v.action2);
      bq.nextAction();
      refute(bq.isBusy);
    },

    "test nextAction"() {
      /**
       * Run next action; calls `whenIdle` if no next action
       **/

      api.protoMethod('nextAction');

      const subject = {}, whenIdle = this.stub();

      const bq = new BusyQueue(subject);
      bq.whenIdle = whenIdle;
      bq.queueAction(v.action = this.stub());
      bq.queueAction(v.action2 = this.stub());
      refute.called(v.action2);

      api.comment("when action is complete call nextAction");
      bq.nextAction();
      api.done();
      refute.called(whenIdle);

      assert.calledWith(v.action2, subject);

      bq.nextAction();
      refute(bq.isBusy);
      assert.calledWith(whenIdle, subject);
    },
  });
});

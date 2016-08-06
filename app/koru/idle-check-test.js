isServer && define(function (require, exports, module) {
  /**
   * IdleCheck keeps count of usage and notifies when idle.
   *
   **/
  var test, v;
  const api = require('koru/test/api');
  const IdleCheck = require('./idle-check');
  const TH  = require('./test-helper');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      api.module();
    },

    tearDown() {
      v = null;
    },

    "test singleton"() {
      /**
       * The default <IdleCheck>. It is used by {@module
       * koru/web-server-factory} and {@module
       * session/server-connection}
       **/
      api.property('singleton');
      assert.same(IdleCheck.singleton, IdleCheck.singleton);
      assert(IdleCheck.singleton instanceof IdleCheck);
    },

    "test constructor"() {
      const newIdleCheck = api.new();
      assert(newIdleCheck() instanceof IdleCheck);
    },

    "waitIdle": {
      setUp() {
        //   FIXME     api.protoMethod('waitIdle');
        v.idleCheck = new IdleCheck();
      },

      "test already Idle"() {
        v.idleCheck.waitIdle(v.stub = test.stub());
        assert.called(v.stub);
      },

      "test multiple listeners"() {
        v.idleCheck = new IdleCheck();
        v.idleCheck.inc();
        v.idleCheck.inc();

        v.idleCheck.waitIdle(v.stub1 = test.stub());
        v.idleCheck.waitIdle(v.stub2 = test.stub());

        v.idleCheck.dec();

        refute.called(v.stub1);
        refute.called(v.stub2);

        v.idleCheck.dec();

        assert.called(v.stub1);
        assert.called(v.stub2);

        v.idleCheck.inc();

        v.idleCheck.waitIdle(v.stub3 = test.stub());
        v.idleCheck.dec();

        assert.calledOnce(v.stub1);
        assert.calledOnce(v.stub3);
      },
    },
  });
});

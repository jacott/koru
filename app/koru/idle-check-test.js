isServer && define(function (require, exports, module) {
  /**
   * IdleCheck keeps count of usage and notifies when idle.
   *
   **/
  var test, v;
  const api       = require('koru/test/api');
  const util      = require('koru/util');
  const IdleCheck = require('./idle-check');
  const TH        = require('./test-helper');

  const {Fiber} = util;

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
       * The default `IdleCheck`. It is used by
       * {#koru/web-server-factory} and
       * {#koru/session/server-connection-factory}
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
      },

      "test already Idle"() {
        /**
         * waitIdle waits until `this.count` drops to zero.
         **/
        api.protoMethod('waitIdle');
        api.example(() => {
          const check = new IdleCheck();
          check.waitIdle(v.stub = test.stub());
          assert.called(v.stub);
        });
      },

      "test multiple listeners"() {
        const start = Date.now();
        v.idleCheck = new IdleCheck();
        v.idleCheck.onDec = this.stub();
        v.idleCheck.inc();
        const f2 = Fiber(() => {
          v.idleCheck.inc();
          Fiber.yield();
          v.idleCheck.dec();
        });

        f2.run();

        const cStart = v.idleCheck.fibers.get(Fiber.current);
        const f2Start = v.idleCheck.fibers.get(f2);

        assert.between(cStart, start, Date.now());
        assert.between(f2Start, start, Date.now());

        v.idleCheck.waitIdle(v.stub1 = test.stub());
        v.idleCheck.waitIdle(v.stub2 = test.stub());

        v.idleCheck.dec();

        refute(v.idleCheck.fibers.get(Fiber.current));

        refute.called(v.stub1);
        refute.called(v.stub2);
        f2.run();

        assert.equals(Array.from(v.idleCheck.fibers.values()), []);

        assert.called(v.stub1);
        assert.called(v.stub2);

        v.idleCheck.inc();

        v.idleCheck.waitIdle(v.stub3 = test.stub());
        v.idleCheck.dec();

        assert.calledOnce(v.stub1);
        assert.calledOnce(v.stub3);

        assert.calledWith(v.idleCheck.onDec, Fiber.current, cStart);
        assert.calledWith(v.idleCheck.onDec, f2, f2Start);
      },
    },
  });
});

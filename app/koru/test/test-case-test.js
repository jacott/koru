define((require, exports, module)=>{
  /**
   * A group of tests. Most methods are for internal purposes and are not documented here.
   *
   * See {#koru/test-helper}
   **/
  const api             = require('koru/test/api');
  const TH              = require('./main');

  const {stub, spy, onEnd, util, stubProperty} = TH;

  const sut  = require('./test-case');

  let v = {};

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
    });

    afterEach(()=>{
      v = {};
    });

    group("sub-test-case", ()=>{
      test("moduleId", ()=>{
        api.protoProperty('moduleId', {info: 'the id of the module this test-case is defined in'});
        assert.same(TH.test.tc.moduleId, 'koru/test/test-case-test');
      });

      test("fullName", ()=>{
        /**
         * Get the name of the test-case prefixed by the parent test-cases (if any).
         **/
        api.protoMethod();
        assert.same(TH.test.tc.fullName(), 'koru/test/test-case sub-test-case');
      });

      test("topTestCase", ()=>{
        /**
         * Retrieve the top most `TestCase`
         **/
        api.protoMethod();
        assert.same(TH.test.tc.topTestCase().fullName(), 'koru/test/test-case');

      });
    });

    group("Test", ()=>{
      let tapi;

      before(()=>{
        tapi = api.innerSubject(TH.test.constructor, 'Test', {
          abstract() {
            /**
             * The Test facilitator responsible for running an individual test. Use
             * {#koru/test-helper}.test to access it. It can also be accessed from
             * `koru._TEST_.test`.
             *
             * Most methods are for internal purposes and are not documented here. But the name is
             * useful for debugging.
             **/
          }
        });
      });

      test("properties", ()=>{
        tapi.protoProperty('moduleId', {info: 'the id of the module this test is defined in'});
        assert.same(TH.test.moduleId, 'koru/test/test-case-test');

        const {name, tc} = TH.test;
        stubProperty(TH.test.constructor.prototype, 'name', {value: name});
        stubProperty(TH.test.constructor.prototype, 'tc', {value: tc});
        tapi.protoProperty('name', {info: 'the full name of the test'});
        assert.equals(TH.test.name, 'koru/test/test-case Test test properties.');

        tapi.protoProperty('tc', {info: 'the test-case containing this test'});
        assert.same(TH.test.tc.fullName(), 'koru/test/test-case Test');
      });
    });

    test("async", async ()=>{
      let later = 4;
      const p = new Promise((resolve)=>{
        setTimeout(()=>{resolve(later)}, 0);
      });
      later = 5;

      assert.equals(await p, 5);
    });

    const Foo = {
      f1() {},
      f2() {},
    };

    group("before,after,once,onEnd", ()=>{
      const {f1, f2} = Foo;
      before(()=>{
        stub(Foo, 'f1');
        onEnd(()=>{
          assert.same(Foo.f1, f1);
          refute.same(Foo.f2, f2);
          assert.equals(v.order, [
            'before', 'beforeEach',
            'one', 'onEnd-beforeEach', 'onEnd-1',
            'afterEach', 'beforeEach',
            'two', 'onEnd-beforeEach',
            'afterEach', 'after']);
        });
        stub(Foo, 'f2');
        v.order = ['before'];
      });

      after(()=>{
        v.order.push('after');
      });

      beforeEach(()=>{
        onEnd(()=>{v.order.push('onEnd-beforeEach')});
        v.order.push('beforeEach');
      });

      afterEach(()=>{
        v.order.push('afterEach');
      });

      test("one", ()=>{
        onEnd(()=>{v.order.push('onEnd-1')});
        v.order.push("one");
        assert.equals(v.order.length, 3);
      });

      test("two", ()=>{
        v.order.push("two");
        assert.equals(v.order.length, 8);
      });
    });
  });
});

define((require, exports, module)=>{
  const TH   = require('./main');

  const {stub, spy, onEnd, util} = TH;

  const sut  = require('./test-case');

  let v = {};

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
    });

    afterEach(()=>{
      v = {};
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

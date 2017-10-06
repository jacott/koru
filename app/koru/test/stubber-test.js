define(function (require, exports, module) {
  const util            = require('koru/util');
  const TH              = require('../test-helper');

  const {stub, spy, onEnd} = TH;

  const sut = require('./stubber');

  let v = null;

  TH.testCase(module, {
    setUp() {
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test withArgs, calledAfter/Before"() {
      const base = stub();

      const argOne = base.withArgs(1);
      const argTwo = base.withArgs(1,{t: 2});
      const argDiff = base.withArgs(2);

      base(1, {t: 2});

      assert.called(argOne);
      assert.called(argTwo);
      refute.called(argDiff);

      refute(argOne.calledBefore(argTwo));
      refute(argOne.calledAfter(argTwo));

      base.call({foo: 'bar'}, 1);

      assert.calledTwice(argOne);
      assert.calledOnce(argTwo);
      assert.equals(argOne.getCall(1).thisValue, {foo: 'bar'});
      assert.same(argOne.getCall(0), argOne.getCall(-2));

      base(2);

      assert.calledThrice(base);
      assert.calledOnce(argDiff);

      assert(argOne.calledBefore(argDiff));
      refute(argOne.calledAfter(argDiff));

      assert(argDiff.calledAfter(argOne));
      refute(argDiff.calledBefore(argOne));
    },

    "test withArgs returns"() {
      const obj = {
        foo: stub().returns(null).withArgs('foo').returns('bar')
          .withArgs("bar").throws(new Error("bar error")),
      };
      const fnord = obj.foo.withArgs("fnord");
      refute.same(fnord, obj.foo);
      assert.same(obj.foo(), null);
      assert.same(obj.foo("foo"), 'bar');
      assert.exception(()=>{
        obj.foo("bar");
      }, 'Error', 'bar error');
      assert.same(fnord("fnord"), null);
      assert.calledOnce(fnord);
      assert.same(obj.foo.subject.callCount, 4);
      assert.same(obj.foo.callCount, 1);
    },

    "test onCall"() {
      const obj = {
        foo: stub().onCall(0).returns(0)
      };

      obj.foo.withArgs(1).onCall(0).returns(1).onCall(1).returns(2);

      assert.same(obj.foo(), 0);
      assert.same(obj.foo(1, 4), 1);
      assert.same(obj.foo(1), 2);
      assert.calledOnce(obj.foo);
      assert.same(obj.foo.subject.callCount, 3);

      const call = obj.foo.subject.getCall(1);
      assert(call.calledWith(1, 4));
      refute(call.calledWith(1, 4, 2));
    },

    "test yields"() {
      const obj = {
        foo: stub().yields(1,2,3)
      };

      assert.same(obj.foo(1, function (a,b,c) {return v.result = [c,b,a]}, function () {return "fail"}), undefined);
      assert.equals(v.result, [3,2,1]);
    },

    "test invokes"() {
      function callback(call) {
        return this === call && call.args[0] === 1;
      }
      const obj = {
        foo: stub().invokes(callback)
      };

      assert.isTrue(obj.foo(1));
    },

    "test cancelYields"() {
      const foo = stub().yields(1);
      foo.cancelYields();
      v.result = 0;
      foo(function () {v.result = 1});

      assert.same(v.result, 0);
    },

    "test prototype function"() {
      class Foo {
        bar() {}
      }

      class Bar extends Foo {
      }

      const subject = spy(Bar.prototype, 'bar');

      assert.hasOwn(Bar.prototype, 'bar');

      new Bar().bar();

      assert.called(subject);

      subject.restore();

      refute.hasOwn(Bar.prototype, 'bar');
    },

    "test spy"() {
      const obj = {foo(a,b,c) {
        v.thisValue = this;
        v.args = [a,b,c];
        return 123;
      }};

      const subject = spy(obj, 'foo');
      assert.same(subject.callCount, 0);

      const with12 = subject.withArgs(1, 2);

      assert.same(subject, obj.foo);

      // invoke
      assert.same(obj.foo(1,2,3), 123);

      assert.same(v.thisValue, obj);
      assert.equals(v.args, [1,2,3]);

      assert.calledWith(subject, 1, 2, 3);

      assert.called(with12);
      assert.same(with12.lastCall.returnValue, 123);
      assert.same(subject.callCount, 1);


      obj.foo.call({diff: 'this'}, 'a');

      assert.equals(subject.firstCall, {globalCount: TH.match.number, args: [1, 2, 3], thisValue: obj, returnValue: 123});
      assert.equals(subject.lastCall, {globalCount: TH.match.number, args: ['a'], thisValue: {diff: 'this'}, returnValue: 123});

      assert.same(subject.callCount, 2);
      assert.same(subject.args(0, 1), 2);
      assert.same(subject.args(1, 0), 'a');
      assert.same(subject.args(-2, -1), 3);
    },

    "test replace func"() {
      const obj = {foo() {v.args = 'orig'}};
      const subject = stub(obj, 'foo', function (a,b,c) {v.args = [a,b,c]});

      assert.same(subject, obj.foo);


      obj.foo(1,2,3);
      assert.equals(v.args, [1,2,3]);

      assert.calledWith(obj.foo, 1, 2, 3);

      obj.foo.restore();
      obj.foo(1,2,3);
      assert.equals(v.args, 'orig');
    },

    "test stub function"() {
      const subject = stub(function (a,b,c) {v.args = [a,b,c]});

      subject(1,2,3);

      assert.calledWith(subject, 1, 2, 3);
    },

    "test yield."() {
      const x = stub();
      x(function foo(arg1, arg2) {v.foo = arg2;});
      x.yield(1,2);
      assert.same(v.foo, 2);
    },

    "test yieldAndReset"() {
      const obj = {run(arg) {}};
      const x = stub(obj, "run");
      obj.run((arg1, arg2)=> v.foo = arg2);
      assert.equals(x.yieldAndReset(1,2), 2);
      assert.same(v.foo, 2);
      refute.called(x);
      obj.run(_=>3);
      assert.equals(x.yieldAndReset(), 3);
    },

    "test yieldAll"() {
      const x = stub();
      x(function foo(arg1, arg2) {v.foo = arg2;});
      x(function bar(arg1, arg2) {v.bar = arg2;});
      assert.same(x.yieldAll(1,2), x);

      assert.same(v.foo, 2);
      assert.same(v.bar, 2);
    },

    "test stub with function"() {
      const obj = {foo() {}};
      stub(obj, 'foo', function (a, b) {return [a,b]});
      assert.equals(obj.foo(1,2), [1,2]);
      assert.calledWith(obj.foo, 1, 2);
    },

    "test basics"() {
      const x = stub();
      refute.called(x);
      assert.isFalse(x.called);
      x.call(v.this = {val: "this"}, 123, {x: "123"});
      assert.isTrue(x.called);
      assert.called(x);
      assert.calledOnce(x);
      assert.calledWith(x, 123);
      refute.calledWithExactly(x, 123);
      assert.calledWith(x, 123, {x: "123"});
      assert.calledWithExactly(x, 123, {x: "123"});
      refute.calledWith(x, 123, {x: "122"});

      assert.equals(x.printf("%C"), "\n    [123, {x: '123'}]");
      assert.equals(x.printf("%n"), "stub");

      x.reset();

      refute.called(x);
      assert.equals(x.printf("%C"), "");

      x(1,2);

      assert.calledOnceWith(x, 1, 2);
    },
  });
});

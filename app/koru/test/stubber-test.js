define(function (require, exports, module) {
  var test, v;
  const util = require('koru/util');
  const TH   = require('../test-helper');
  const sut  = require('./stubber');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test withArgs, calledAfter/Before"() {
      var base = test.stub();

      var argOne = base.withArgs(1);
      var argTwo = base.withArgs(1,{t: 2});
      var argDiff = base.withArgs(2);

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

      base(2);

      assert.calledThrice(base);
      assert.calledOnce(argDiff);

      assert(argOne.calledBefore(argDiff));
      refute(argOne.calledAfter(argDiff));

      assert(argDiff.calledAfter(argOne));
      refute(argDiff.calledBefore(argOne));
    },

    "test withArgs returns"() {
      var obj = {
        foo: test.stub().returns(null).withArgs('foo').returns('bar')
          .withArgs("bar").throws(new Error("bar error")),
      };
      var fnord = obj.foo.withArgs("fnord");
      refute.same(fnord, obj.foo);
      assert.same(obj.foo(), null);
      assert.same(obj.foo("foo"), 'bar');
      assert.exception(function () {
        obj.foo("bar");
      }, 'Error', 'bar error');
      assert.same(fnord("fnord"), null);
      assert.calledOnce(fnord);
      assert.same(obj.foo.subject.callCount, 4);
      assert.same(obj.foo.callCount, 1);
    },

    "test onCall"() {
      var obj = {
        foo: test.stub().onCall(0).returns(0)
      };

      obj.foo.withArgs(1).onCall(0).returns(1).onCall(1).returns(2);

      assert.same(obj.foo(), 0);
      assert.same(obj.foo(1, 4), 1);
      assert.same(obj.foo(1), 2);
      assert.calledOnce(obj.foo);
      assert.same(obj.foo.subject.callCount, 3);

      var call = obj.foo.subject.getCall(1);
      assert(call.calledWith(1, 4));
      refute(call.calledWith(1, 4, 2));
    },

    "test yields"() {
      var obj = {
        foo: test.stub().yields(1,2,3)
      };

      assert.same(obj.foo(1, function (a,b,c) {return v.result = [c,b,a]}, function () {return "fail"}), undefined);
      assert.equals(v.result, [3,2,1]);
    },

    "test cancelYields"() {
      var foo = test.stub().yields(1);
      foo.cancelYields();
      v.result = 0;
      foo(function () {v.result = 1});

      assert.same(v.result, 0);
    },

    "test spy"() {
      var obj = {foo(a,b,c) {
        v.thisValue = this;
        v.args = [a,b,c];
        return 123;
      }};

      var spy = test.spy(obj, 'foo');
      assert.same(spy.callCount, 0);

      var with12 = spy.withArgs(1, 2);

      assert.same(spy, obj.foo);

      // invoke
      assert.same(obj.foo(1,2,3), 123);

      assert.same(v.thisValue, obj);
      assert.equals(v.args, [1,2,3]);

      assert.calledWith(spy, 1, 2, 3);

      assert.called(with12);
      assert.same(with12.lastCall.returnValue, 123);
      assert.same(spy.callCount, 1);


      obj.foo.call({diff: 'this'}, 'a');

      assert.equals(spy.firstCall, {globalCount: TH.match.number, args: [1, 2, 3], thisValue: obj, returnValue: 123});
      assert.equals(spy.lastCall, {globalCount: TH.match.number, args: ['a'], thisValue: {diff: 'this'}, returnValue: 123});

      assert.same(spy.callCount, 2);
      assert.same(spy.args(0,1), 2);
      assert.same(spy.args(1,0), 'a');
    },

    "test replace func"() {
      var obj = {foo() {v.args = 'orig'}};
      var stub = test.stub(obj, 'foo', function (a,b,c) {v.args = [a,b,c]});

      assert.same(stub, obj.foo);


      obj.foo(1,2,3);
      assert.equals(v.args, [1,2,3]);

      assert.calledWith(obj.foo, 1, 2, 3);

      obj.foo.restore();
      obj.foo(1,2,3);
      assert.equals(v.args, 'orig');
    },

    "test yield"() {
      var x = test.stub();
      x(function foo(arg1, arg2) {v.foo = arg2;});
      x.yield(1,2);
      assert.same(v.foo, 2);
    },

    "test stub with function"() {
      var obj = {foo: function() {}};
      test.stub(obj, 'foo', function (a, b) {return [a,b]});
      assert.equals(obj.foo(1,2), [1,2]);
      assert.calledWith(obj.foo, 1, 2);
    },

    "test basics"() {
      var x = test.stub();
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

      assert.equals(x.printf("%C"), "\n    123, {x: '123'}");
      assert.equals(x.printf("%n"), "stub");

      x.reset();

      refute.called(x);
      assert.equals(x.printf("%C"), "");

      x(1,2);

      assert.calledOnceWith(x, 1, 2);
    },
  });
});

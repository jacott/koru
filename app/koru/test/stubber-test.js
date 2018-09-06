define((require, exports, module)=>{
  /**
   * Spies and Stubs are functions which record the call arguments, this value and return of each
   * call made to them. They can intercept calls to Object getter, setter and function properties.
   *
   * Spies will just record the interaction whereas Stubs will replace the call with a custom
   * function.
   *
   * A Spy is an instance of a Stub.
   *
   * Stubs are usually called from tests using the specialized version in {#koru/test/main}. The
   * test versions will auto restore after the test or testCase has completed.
   * ```js
const {stub, spy, intercept} = TH;
   * ```
   *
   **/
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const TH              = require('../test-helper');

  const {stub, spy, onEnd} = TH;

  const stubber = require('./stubber');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("stub", ()=>{
      /**
       * Create a {#::Stub}. Can stub a object function or be unattached.
       *
       **/
      api.method();
      //[
      const standalone = stubber.stub();
      standalone();
      assert.called(standalone);

      const Book = {
        lastReadPage: 0,
        read(pageNo) {this.lastReadPage = pageNo}
      };

      const read = stubber.stub(Book, 'read', n => n*2);
      assert.same(read, Book.read);

      assert.equals(Book.read(28), 56);

      assert.same(Book.lastReadPage, 0);
      assert.calledWith(read, 28);
      //]
    });

    test("spy", ()=>{
      /**
       * Create a spy. A spy is a {#::Stub} that calls the original function.
       **/
      api.method();
      //[
      const Book = {
        lastReadPage: 0,
        read(pageNo) {this.lastReadPage = pageNo}
      };

      const read = stubber.spy(Book, 'read');
      assert.same(read, Book.read);

      Book.read(28);
      assert.same(Book.lastReadPage, 28);

      assert.calledWith(read, 28);
      //]
    });

    test("spy continued", ()=>{
      let thisValue, args;
      const obj = {foo(a,b,c) {
        thisValue = this;
        args = [a,b,c];
        return 123;
      }};

      const subject = spy(obj, 'foo');
      assert.same(subject.callCount, 0);

      const with12 = subject.withArgs(1, 2);

      assert.same(subject, obj.foo);

      // invoke
      assert.same(obj.foo(1,2,3), 123);

      assert.same(thisValue, obj);
      assert.equals(args, [1,2,3]);

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
    });

    test("intercept", ()=>{
      /**
       * Create an intercept. An intercept is a lightweight stub. It does not record any calls.
       **/
      api.method();
      //[
      const Book = {
        lastReadPage: 0,
        read(pageNo) {this.lastReadPage = pageNo}
      };

      stubber.intercept(Book, 'read', function (n) {this.lastReadPage = n - 2});
      Book.read(28);
      assert.same(Book.lastReadPage, 26);
      Book.read.restore();
      Book.read(28);
      assert.same(Book.lastReadPage, 28);
      //]
    });

    test("isStubbed", ()=>{
      /**
       * Determine if a function is stubbed.
       **/
      api.method();
      //[
      const book = {
        read() {}
      };

      assert.isFalse(stubber.isStubbed(book.read));

      stubber.stub(book, 'read');

      assert.isTrue(stubber.isStubbed(book.read));
      //]
    });


    test("prototype function", ()=>{
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
    });

    group("Stub", ()=>{
      let sApi;
      before(()=>{
        sApi = api.innerSubject(stubber.stub().constructor, 'Stub', {
          abstract() {
            /**
             * Stub and Spy methods.
             **/
          }
        });
      });

      after(()=>{sApi = undefined});

      test("restore", ()=>{
        /**
         * Restore the original function
         **/
        //[
        let args;
        const obj = {foo() {args = 'aStub'}};
        stubber.stub(obj, 'foo', (a,b,c)=>{args = [a,b,c]});
        //]
        sApi.customIntercept(obj.foo, {name: 'restore', sig: 'Stub#'});
        //[
        obj.foo(1,2,3);
        assert.equals(args, [1,2,3]);

        assert.calledWith(obj.foo, 1, 2, 3);

        obj.foo.restore();
        obj.foo(1,2,3);
        assert.equals(args, 'aStub');
        //]
      });

      test("withArgs", ()=>{
        /**
         * Create a refined stub (or spy) that relates to a particular list of call arguments. This
         * stub will only be invoked if the subject is called with a list of arguments that match.
         *
         * @param {any-type} args each arg is tested against the call to determine if this stub should be
         * used. Matchers can be used as arguments.

         * @return the new sub-stub
         **/
        sApi.protoMethod();

        const aStub = stubber.stub().returns(null);
        const foo = aStub.withArgs('foo').returns('foo');
        const bar = foo.withArgs("bar").throws(new Error("bar error"));
        const fnord = foo.withArgs(TH.match.number, TH.match.string).returns('fnord');

        refute.same(fnord, foo);

        assert.same(foo(), null);
        assert.same(foo("foo"), 'foo');
        assert.exception(()=>{
          foo("bar");
        }, 'Error', 'bar error');
        assert.same(aStub(1, "two"), 'fnord');

        assert.same(aStub.callCount, 4);
        assert.same(foo.subject.callCount, 4);
        assert.same(foo.callCount, 1);
        assert.same(bar.callCount, 1);
        assert.same(bar.subject.callCount, 4);
        assert.same(fnord.callCount, 1);
        //]
      });

      test("withArgs, calledAfter/Before", ()=>{
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
      });

      test("returns", ()=>{
        /**
         * Control what value a stub returns.
         *
         * @param {any-type} arg the value to return
         *
         * @return the stub
         **/
        sApi.protoMethod();
        //[
        const aStub = stubber.stub().returns(null);
        aStub.returns('default').onCall(2).returns('two');

        assert.same(aStub(), 'default');
        assert.same(aStub(), 'default');
        assert.same(aStub(), 'two');
        assert.same(aStub(), 'default');
        //]
      });

      test("onCall", ()=>{
        /**
         * Create a refined stub for a particular call repetition.
         *
         * @param count the `count`th call to refine.

         * @return the new stub controlling the `count`th call.
         **/
        sApi.protoMethod();
        //[
        const aStub = stubber.stub().returns(null);
        const stub0 = aStub.onCall(0).returns(0);

        aStub.withArgs(1)
          .onCall(0).returns(1)
          .onCall(1).returns(2);

        assert.same(aStub(), 0);
        assert.same(aStub(1, 4), 1);
        assert.same(aStub(1), 2);
        assert.calledOnce(stub0);
        assert.same(stub0.subject, aStub);

        assert.same(aStub.callCount, 3);

        const call = aStub.getCall(1);
        assert(call.calledWith(1, 4));
        //]
        refute(call.calledWith(2));
      });

      test("yields", ()=>{
        /**
         * Trigger the stub automatically to call the first callback.
         *
         * @param {any-type} args will be passed to the callback.
         *
         * @return the stub
         **/
        sApi.protoMethod();
        //[
        const aStub = stubber.stub();

        aStub.yields(1,2,3);

        let result;
        aStub(1, (a,b,c) => result = [c,b,a], ()=> "not me");
        assert.equals(result, [3,2,1]);
        //]
      });

      test("invokes", ()=>{
        /**
         * Invoke `callback` when the stub is called. The callback's result will be returned to the
         * stub caller.
         *
         * @param callback the function to run
         *
         * @returns the stub
         **/
        sApi.protoMethod();
        //[
        function callback(call) {
          return this === call && call.args[0] === 1;
        }
        const aStub = stubber.stub();

        aStub.invokes(callback);

        assert.isFalse(aStub(2));
        assert.isTrue(aStub(1));

        assert.same(aStub.firstCall.returnValue, false);
        assert.same(aStub.lastCall.returnValue, true);
        //]
      });

      test("cancelYields", ()=>{
        /**
         * remove automatic yield
         *
         * @return the stub
         **/
        sApi.protoMethod();
        //[
        const aStub = stubber.stub();
        aStub.yields(1);

        aStub.cancelYields();

        let result = 0;
        aStub(()=>{result = 1});

        assert.same(result, 0);
        //]
      });

      test("yield", ()=>{
        /**
         * Call the first callback of the first call to stub.
         *
         * @param {any-type} args the arguments to pass to the callback.
         *
         * @return {any-type} the result from the callback.
         **/
        sApi.protoMethod();
        //[
        const aStub = stubber.stub();
        let result;
        aStub((arg1, arg2)=> result = arg2);

        assert.same(
          aStub.yield(1,2),
          2);

        assert.same(result, 2);
        //]
        aStub.reset();
      });

      test("yieldAndReset", ()=>{
        /**
         * Like {##yield} but also calls reset on the stub.
         *
         * @param {any-type} args the arguments to pass to the callback.
         *
         * @return {any-type} the result from the callback.
         **/
        sApi.protoMethod();
        //[
        const obj = {run(arg) {}};
        const aStub = stub(obj, "run");
        let arg2;
        obj.run((a1, a2)=> arg2 = a2);
        assert.equals(aStub.yieldAndReset(1,2), 2);

        assert.same(arg2, 2);
        refute.called(aStub);
        obj.run(_=>3);
        assert.equals(aStub.yieldAndReset(), 3);
        //]
      });
      test("yieldAll", ()=>{
        /**
         * Like {##yield} but yields for all calls to stub; not just the first.
         *
         * @param {any-type} args the arguments to pass to the callback.
         *
         * @return the stub.
         **/
        sApi.protoMethod();
        //[
        const aStub = stub();
        let foo, bar;
        aStub(function (arg1, arg2) {foo = arg1;});
        aStub((arg1, arg2)=>{bar = arg2;});

        assert.same(
          aStub.yieldAll(1,2),
          aStub);

        assert.same(foo, 1);
        assert.same(bar, 2);
      });

      group("inspect", ()=>{
        let aStub;
        const setupExample = ()=>{
          aStub = stubber.stub();
          //[
          aStub(1,2,3);
          aStub(4,5,6);
          //]
        };

        before(setupExample);
        after(()=>{aStub = undefined});

        test("properties", ()=>{
          sApi.protoProperty('firstCall', {info: `The first call to the stub`});
          sApi.protoProperty('lastCall', {info: `The last call to the stub`});
          sApi.protoProperty('callCount', {info: `How many times the stub has been called`});
          sApi.protoProperty('called', {info: `Has the stub been called at least once`});
          sApi.protoProperty('calledOnce', {info: `Has the stub been called exactly once`});
          sApi.protoProperty('calledTwice', {info: `Has the stub been called exactly twice`});
          sApi.protoProperty('calledThrice', {info: `Has the stub been called exactly 3 times`});

          const aStub = stub();
          assert.same(aStub.firstCall, undefined);
          refute.called(aStub);
          assert.isFalse(aStub.called);

          aStub.call({val: "this"}, 123, {aStub: "123"});

          assert.isTrue(aStub.called);
          assert.called(aStub);
          assert.calledOnce(aStub);

          assert.calledWith(aStub, 123);
          refute.calledWithExactly(aStub, 123);
          assert.calledWith(aStub, 123, {aStub: "123"});
          assert.calledWithExactly(aStub, 123, {aStub: "123"});
          refute.calledWith(aStub, 123, {aStub: "122"});

          assert.equals(aStub.printf("%C"), "\n    [123, {aStub: '123'}]");
          assert.equals(aStub.printf("%n"), "stub");

          assert.isTrue(aStub.calledOnce);
          assert.isFalse(aStub.calledTwice);
          assert.isFalse(aStub.calledThrice);

          aStub.call({val: "middlethis"}, 456);

          assert.isFalse(aStub.calledOnce);
          assert.isTrue(aStub.calledTwice);
          assert.isFalse(aStub.calledThrice);

          aStub.call({val: "lastthis"}, 789);

          assert.isFalse(aStub.calledOnce);
          assert.isFalse(aStub.calledTwice);
          assert.isTrue(aStub.calledThrice);

          assert.equals(aStub.callCount, 3);

          assert.equals(aStub.firstCall.thisValue, {val: "this"});
          assert.equals(aStub.lastCall.thisValue, {val: "lastthis"});
          refute.calledOnce(aStub);

          aStub.reset();

          refute.called(aStub);
          assert.equals(aStub.printf("%C"), "");

          aStub(1,2);

          assert.calledOnceWith(aStub, 1, 2);
        });

        group("methods", ()=>{
          test("getCall", ()=>{
            /**
             * Get the details of a particular call to stub.
             *
             * @param index the nth call to stub; 0 is first call.
             *
             * @return the call object.
             *
             **/
            sApi.protoMethod();
            sApi.example(setupExample);
            //[
            assert.equals(aStub.getCall(1).args, [4, 5, 6]);
            //]
          });

          test("calledBefore", ()=>{
            /**
             * Test this stub is called before `after`.
             *
             * @param after a stub to test against
             *
             **/
            sApi.protoMethod();
            sApi.example(setupExample);
            //[
            const stub2 = stubber.stub();
            stub2();
            assert.isTrue(aStub.calledBefore(stub2));
            //]
          });

          test("calledAfter", ()=>{
            /**
             * Test this stub is called after `before`.
             *
             * @param before a stub to test against
             *
             **/
            sApi.protoMethod();
            sApi.example(setupExample);
            //[
            const stub2 = stubber.stub();
            stub2();
            assert.isTrue(stub2.calledAfter(aStub));
            //]
          });

          test("calledWith", ()=>{
            /**
             * Was the stub called with the given `args`.
             *
             * @param args the args to test were passed; extra args in the call will be ignored.
             *
             * @returns true when the stub was called with `args`.
             **/
            sApi.protoMethod();
            sApi.example(setupExample);
            //[
            const aStub = stubber.stub();

            aStub(1,2,3);
            aStub(4,5,6);

            assert.isTrue(aStub.calledWith(1,2));
            assert.isTrue(aStub.calledWith(1,2,3));
            assert.isTrue(aStub.calledWith(4));

            assert.isFalse(aStub.calledWith(1,2,3,4));
            assert.isFalse(aStub.calledWith(5));
            //]
          });

          test("calledWithExactly", ()=>{
            /**
             * Was the stub called with the given `args` and no extra args.
             *
             * @param args the args to test were passed.
             *
             **/
            sApi.protoMethod();
            sApi.example(setupExample);
            //[
            const aStub = stubber.stub();

            aStub(1,2,3);
            aStub(4,5,6);

            assert.isTrue(aStub.calledWithExactly(1,2,3));
            assert.isTrue(aStub.calledWithExactly(4,5,6));

            assert.isFalse(aStub.calledWithExactly(1,2));
            assert.isFalse(aStub.calledWithExactly(1,2,3,4));
            assert.isFalse(aStub.calledWithExactly(4,5));
            //]
          });

        });
      });

      group("call", ()=>{
        let cApi;
        before(()=>{
          const aStub = stubber.stub();
          aStub();
          cApi = sApi.innerSubject(
            aStub.firstCall.constructor,
            'Call', {
              abstract() {
                /**
                 * Details of a Stub call.
                 **/
              }
            }
          );
        });

        test("properties", ()=>{
          cApi.protoProperty('globalCount', {info: `The index in the sequence of all stub
calls since the start of the program`});
          cApi.protoProperty('args', {info: `the args of the call`});
          cApi.protoProperty('thisValue', {info: 'the `this` value of the call'});

          const foo = {foo: 'foo'};

          const aStub = stubber.stub();
          aStub.call(foo, 1,2,3);
          assert.same(aStub.globalCount, aStub.globalCount);
          assert.equals(aStub.firstCall.args, [1,2,3]);
          assert.same(aStub.firstCall.thisValue, foo);

          cApi.done();
          aStub.reset();

          aStub(1,2,3); aStub(); aStub(4,5,6);

          assert(aStub.firstCall.globalCount < aStub.lastCall.globalCount);
          assert.equals(aStub.firstCall.args, [1,2,3]);
        });

        test("calledWith", ()=>{
          /**
           * Was this call called with the given `args`.
           *
           * @param args the args to test were passed; extra args in the call will be ignored.
           *
           * @returns the call matches the arg list.
           **/
          cApi.protoMethod();
          //[
          const aStub = stubber.stub();

          aStub(1,2,3);
          aStub(4,5,6);

          const {firstCall} = aStub;

          assert.isTrue(firstCall.calledWith(1,2));
          assert.isTrue(firstCall.calledWith(1,2,3));

          assert.isFalse(firstCall.calledWith(1,2,3,4));
          assert.isFalse(firstCall.calledWith(4));
          //]
        });

        test("yield", ()=>{
          /**
           * Trigger the stub automatically to call the first callback.
           *
           * @param {any-type} args will be passed to the callback.
           *
           **/
          cApi.protoMethod();
          //[
          const aStub = stubber.stub();
          let arg2;

          aStub(1, 2, (a, b)=> arg2 = b);

          aStub.firstCall.yield(4,5);

          assert.same(arg2, 5);
          //]
        });
      });


    });

    test("stub with function", ()=>{
      const obj = {foo() {}};
      stub(obj, 'foo', function (a, b) {return [a,b]});
      assert.equals(obj.foo(1,2), [1,2]);
      assert.calledWith(obj.foo, 1, 2);
    });
  });
});

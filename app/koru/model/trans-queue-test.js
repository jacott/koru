define((require, exports, module)=>{
  'use strict';
  /**
   * Run code within a transaction.
   **/
  const Model           = require('koru/model/main');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const TH              = require('./test-helper');

  const {stub, spy} = TH;

  const TransQueue = require('./trans-queue');
  const sut = TransQueue;

  let v = {};

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    before(()=>{
      v.TestModel = Model.define('TestModel').defineFields({name: 'text'});
    });

    after(()=>{
      Model._destroyModel('TestModel', 'drop');
      util.thread.date = void 0;
      v = {};
    });

    test("transaction", ()=>{
      /**
       * Start a transaction.  On server the transaction is linked to `Fiber.current` and a DB
       * transaction can also be attached. On client only one transaction can be running.

       * @param {koru/pg/driver::Client} [db] an optional database connection which has a
       * `transaction` method.

       * @param {function} body the function to run within the transaction.
       **/
      api.method();
      //[
      let inTrans = false;
      TransQueue.transaction(()=>{
        inTrans = TransQueue.isInTransaction();
      });
      assert.isTrue(inTrans);
      //]
    });

    test("isInTransaction", ()=>{
      /**
       * Test if currently in a transaction.
       **/
      api.method();
      //[
      assert.isFalse(TransQueue.isInTransaction());
      TransQueue.transaction(()=>{
        assert.isTrue(TransQueue.isInTransaction());
      });
      assert.isFalse(TransQueue.isInTransaction());
      //]
    });

    test("onSuccess", ()=>{
      /**
       * Register a function to be called if the most outer transaction finishes successfully or if
       * no transaction is running.

       * @param func the function to run on success.
       **/
      api.method();
      const func1 = stub();
      TransQueue.transaction(()=>{
        TransQueue.transaction(()=>{
          TransQueue.onSuccess(func1);
        });
        refute.called(func1);   // not called until outer transaction finishes
      });
      assert.calledOnce(func1);

      func1.reset();
      TransQueue.onSuccess(func1); // called now since no transaction
      assert.calledOnce(func1);

      func1.reset();
      try {
        TransQueue.transaction(()=>{
          TransQueue.onSuccess(func1);
          throw "abort";
        });
      } catch(ex) {
        if (ex !== "abort") throw ex;
      }
      refute.called(func1);     // not called since transaction aborted
    });

    test("onAbort", ()=>{
      /**
       * Register a function to be called if the most outer transaction aborts.

       * @param func the function to run only if aborted.
       **/
      api.method();
      const func1 = stub();
      try {
        TransQueue.transaction(()=>{
          try {
            TransQueue.transaction(()=>{
              TransQueue.onAbort(func1);
              throw "abort";
            });
          } finally {
            refute.called(func1);   // not called until outer transaction finishes
          }
        });
      } catch(ex) {
        if (ex !== "abort") throw ex;
      }
      assert.calledOnce(func1);

      func1.reset();
      TransQueue.transaction(()=>{
        TransQueue.onAbort(func1);
      });
      refute.called(func1);
    });

    test("finally", ()=>{
      /**
       * Register a function to be called when the most outer transaction finishes either
       * successfully or by aborting.

       * @param func the function to run on transaction end.
       **/
      api.method();
      const func1 = stub();
      try {
        TransQueue.transaction(()=>{
          try {
            TransQueue.transaction(()=>{
              TransQueue.finally(func1);
              throw "abort";
            });
          } finally {
            refute.called(func1);   // not called until outer transaction finishes
          }
        });
      } catch(ex) {
        if (ex !== "abort") throw ex;
      }
      assert.calledOnce(func1);

      func1.reset();
      TransQueue.transaction(()=>{
        TransQueue.finally(func1);
      });
      assert.calledOnce(func1);
    });

    test("success", ()=>{
      const stub1 = stub();
      const stub2 = stub();
      const err1 = stub();
      const fin1 = stub();

      const now = util.thread.date = Date.now();
      after(()=>{util.thread.date = void 0});

      sut._clearLastTime();

      assert.isFalse(sut.isInTransaction());

      const result = sut.transaction(v.TestModel, () => {
        assert.isTrue(sut.isInTransaction());
        assert.same(now, util.dateNow());
        sut.onAbort(err1);
        sut.onSuccess(stub1);
        sut.transaction(v.TestModel, () => sut.onSuccess(()=>{
          sut.finally(fin1);
          assert.same(now, util.dateNow()); // ensure same time as top transaction

          sut.onSuccess(stub2); // double nested should still fire
          assert.isTrue(sut.isInTransaction());
          refute.called(stub2);
        }));
        refute.called(stub1);
        refute.called(stub2);
        refute.called(fin1);
        return "success";
      });

      assert.same(now, util.dateNow());

      assert.same(result, "success");
      assert.called(stub1);
      assert(stub2.calledAfter(stub1));
      refute.called(err1);

      assert.called(fin1);

      stub1.reset();
      stub2.reset();

      sut.transaction(v.TestModel, () => {
        assert.same(now+1, util.dateNow()); // ensure time unique to transaction

        sut.onSuccess(stub1);
      });

      assert.called(stub1);
      refute.called(stub2);
    });

    test("no db", ()=>{
      assert.same(sut.transaction(() => "result"), "result");
    });

    test("simple success", ()=>{
      assert.same(sut.transaction(v.TestModel, () => "result"), "result");
    });

    test("simple exception", ()=>{
      assert.exception(() => {
        sut.transaction(v.TestModel, () => {throw new Error("an error")});
      }, {message: 'an error'});
    });

    test("onSuccess in onSuccess", ()=>{
      sut.transaction(()=>{
        sut.onSuccess(()=>{
          assert(sut.isInTransaction);
        });
      });
    });

    test("exception", ()=>{
      const stub1 = stub();
      const stub2 = stub();
      const err1 = stub();
      const err2 = stub();
      const err3 = stub();
      const fin1 = stub();
      const fin2 = stub();

      assert.exception(() => sut.transaction(v.TestModel, () => {
        sut.onAbort(err1);
        sut.onAbort(err2);
        sut.onSuccess(stub1);
        sut.finally(fin1);
        sut.transaction(v.TestModel, () => {
          sut.onSuccess(stub2);
          try {
            sut.transaction(v.TestModel, () => {
              sut.finally(fin2);
              sut.onAbort(err3);
              throw new Error("err3");
            });
          } catch (ex) {}
        });
        refute.called(fin1);
        refute.called(fin2);
        // err3 should not be called
        throw new Error("an error: " + err3.called);
      }), {message: 'an error: false'});

      refute.called(stub1);
      refute.called(stub2);

      assert.called(err1);
      assert.called(err2);
      assert.called(err3);
      assert.called(fin1);
      assert.called(fin2);

      sut.transaction(v.TestModel, () => {
        sut.onSuccess(stub1);
      });

      assert.called(stub1);
      refute.called(stub2);
    });

    test("no transaction", ()=>{
      const stub1 = stub();

      sut.onSuccess(stub1);

      assert.called(stub1);

      const stub2 = stub();
      sut.finally(stub2);

      assert.called(stub2);
    });
  });
});

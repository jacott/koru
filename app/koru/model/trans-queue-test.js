define((require, exports, module)=>{
  const Model           = require('koru/model/main');
  const util            = require('koru/util');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd} = TH;

  const sut = require('./trans-queue');

  let v = {};

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    before(()=>{
      v.TestModel = Model.define('TestModel').defineFields({name: 'text'});
    });

    after(()=>{
      Model._destroyModel('TestModel', 'drop');
      util.thread.date = null;
      v = {};
    });

    test("success", ()=>{
      const stub1 = stub();
      const stub2 = stub();
      const err1 = stub();

      const now = util.thread.date = Date.now();

      sut._clearLastTime();

      assert.isFalse(sut.isInTransaction());

      const result = sut.transaction(v.TestModel, () => {
        assert.isTrue(sut.isInTransaction());
        assert.same(now, util.dateNow());
        sut.onAbort(err1);
        sut.onSuccess(stub1);
        sut.transaction(v.TestModel, () => sut.onSuccess(()=>{
          assert.same(now, util.dateNow()); // ensure same time as top transaction

          sut.onSuccess(stub2); // double nested should still fire
          assert.isTrue(sut.isInTransaction());
          refute.called(stub2);
        }));
        refute.called(stub1);
        refute.called(stub2);
        return "success";
      });

      assert.same(now, util.dateNow());


      assert.same(result, "success");
      assert.called(stub1);
      assert(stub2.calledAfter(stub1));
      refute.called(err1);

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

      assert.exception(() => sut.transaction(v.TestModel, () => {
        sut.onAbort(err1);
        sut.onAbort(err2);
        sut.onSuccess(stub1);
        sut.transaction(v.TestModel, () => {
          sut.onSuccess(stub2);
          try {
            sut.transaction(v.TestModel, () => {
              sut.onAbort(err3);
              throw new Error("err3");
            });
          } catch (ex) {}
        });
        // err3 should not be called
        throw new Error("an error: " + err3.called);
      }), {message: 'an error: false'});

      refute.called(stub1);
      refute.called(stub2);

      assert.called(err1);
      assert.called(err2);
      assert.called(err3);

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
    });
  });
});

define(function (require, exports, module) {
  var test, v;
  const Model = require('koru/model/main');
  const sut   = require('./trans-queue');
  const TH    = require('./test-helper');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      v.TestModel = Model.define('TestModel').defineFields({name: 'text'});
    },

    tearDown() {
      Model._destroyModel('TestModel', 'drop');
      v = null;
    },

    "test success"() {
      let stub1 = test.stub();
      let stub2 = test.stub();
      let err1 = test.stub();

      var result = sut.transaction(v.TestModel, () => {
        sut.onAbort(err1);
        sut.onSuccess(stub1);
        sut.transaction(v.TestModel, () => sut.onSuccess(stub2));
        refute.called(stub1);
        refute.called(stub2);
        return "success";
      });

      assert.same(result, "success");
      assert.called(stub1);
      assert(stub2.calledAfter(stub1));
      refute.called(err1);

      stub1.reset();
      stub2.reset();

      sut.transaction(v.TestModel, () => {
        sut.onSuccess(stub1);
      });

      assert.called(stub1);
      refute.called(stub2);
    },

    "test simple success"() {
      assert.same(sut.transaction(v.TestModel, () => "result"), "result");
    },

    "test simple exception"() {
      assert.exception(() => {
        sut.transaction(v.TestModel, () => {throw new Error("an error")});
      }, {message: 'an error'});
    },

    "test exception"() {
      let stub1 = test.stub();
      let stub2 = test.stub();
      let err1 = test.stub();
      let err2 = test.stub();
      let err3 = test.stub();

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
    },

    "test no transaction"() {
      let stub1 = test.stub();

      sut.onSuccess(stub1);

      assert.called(stub1);

    },
  });
});

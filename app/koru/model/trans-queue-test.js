define(function (require, _, module) {
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

      var result = sut.transaction(v.TestModel, () => {
        sut.push(stub1);
        sut.transaction(v.TestModel, () => sut.push(stub2));
        refute.called(stub1);
        refute.called(stub2);
        return "success";
      });

      assert.same(result, "success");
      assert.called(stub1);
      assert(stub2.calledAfter(stub1));

      stub1.reset();
      stub2.reset();

      sut.transaction(v.TestModel, () => {
        sut.push(stub1);
      });

      assert.called(stub1);
      refute.called(stub2);
    },

    "test exception"() {
      let stub1 = test.stub();
      let stub2 = test.stub();

      assert.exception(() => sut.transaction(v.TestModel, () => {
        sut.push(stub1);
        sut.transaction(v.TestModel, () => sut.push(stub2));
        throw new Error("an error");
      }), {message: 'an error'});

      refute.called(stub1);
      refute.called(stub2);

      sut.transaction(v.TestModel, () => {
        sut.push(stub1);
      });

      assert.called(stub1);
      refute.called(stub2);
    },

    "test no transaction"() {
      let stub1 = test.stub();

      sut.push(stub1);

      assert.called(stub1);

    },
  });
});

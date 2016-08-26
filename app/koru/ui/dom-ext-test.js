isClient && define(function (require, exports, module) {
  var test, v;
  const Model   = require('koru/model/main');
  const session = require('koru/session');
  const util    = require('koru/util');
  const Dom     = require('./dom-ext');
  const TH      = require('./test-helper');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      test.stub(session, 'sendM');
      v.TestModel = Model.define('TestModel').defineFields({name: 'text', foo_ids: 'integer[]'});
    },

    tearDown: function () {
      Model._destroyModel('TestModel', 'drop');
      v = null;
    },

    "test autoUpdate": function () {
      var foo = v.TestModel.create({foo_ids: [1]});
      test.spy(foo, '$reload');

      var obs = test.spy(v.TestModel, 'onChange');

      var ctx = {updateAllTags: test.stub(), onDestroy: test.stub(), data: foo};

      Dom.autoUpdate(ctx, {field: 'foo_ids'});

      assert.calledWith(ctx.onDestroy, obs.firstCall.returnValue);

      var foo2 = v.TestModel.create();

      obs.yield(util.reverseExtend({foo_ids: [1]}, foo2.attributes), foo2.attributes);

      refute.called(foo.$reload);
      refute.called(ctx.updateAllTags);

      foo.$change('foo_ids').push(2);
      foo.$$save();

      assert.called(foo.$reload);
      assert.called(ctx.updateAllTags);

      foo.$reload.reset();
      ctx.updateAllTags.reset();

      foo.name= 'new name';
      foo.$$save();

      assert.called(foo.$reload);
      assert.called(ctx.updateAllTags);

      foo.$reload.reset();

      v.TestModel.notify({_id: foo._id});

      refute.called(foo.$reload);
    },
  });
});

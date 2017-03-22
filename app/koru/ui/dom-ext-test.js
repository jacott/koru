isClient && define(function (require, exports, module) {
  const Model   = require('koru/model/main');
  const session = require('koru/session');
  const util    = require('koru/util');
  const TH      = require('./test-helper');

  const Dom     = require('./dom-ext');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
      this.stub(session, '_sendM');
      v.TestModel = Model.define('TestModel').defineFields({name: 'text', foo_ids: 'integer[]'});
    },

    tearDown() {
      Model._destroyModel('TestModel', 'drop');
      v = null;
    },

    "test autoUpdate"() {
      const foo = v.TestModel.create({foo_ids: [1]});
      this.spy(foo, '$reload');

      const obs = this.spy(v.TestModel, 'onChange');

      const ctx = {updateAllTags: this.stub(), onDestroy: this.stub(), data: foo};

      Dom.autoUpdate(ctx, {field: 'foo_ids'});

      assert.calledWith(ctx.onDestroy, obs.firstCall.returnValue);

      const foo2 = v.TestModel.create();

      obs.yield(util.reverseMerge({foo_ids: [1]}, foo2.attributes), foo2.attributes);

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

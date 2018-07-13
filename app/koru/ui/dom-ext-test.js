isClient && define((require, exports, module)=>{
  const Model           = require('koru/model/main');
  const session         = require('koru/session');
  const util            = require('koru/util');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd} = TH;

  const Dom     = require('./dom-ext');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    let TestModel;
    beforeEach(()=>{
      stub(session, '_sendM');
      TestModel = Model.define('TestModel').defineFields({name: 'text', foo_ids: 'integer[]'});
    });

    afterEach(()=>{
      Model._destroyModel('TestModel', 'drop');
      TestModel = null;
    });

    test("autoUpdate", ()=>{
      const foo = TestModel.create({foo_ids: [1]});
      spy(foo, '$reload');

      const obs = spy(TestModel, 'onChange');

      const ctx = {updateAllTags: stub(), onDestroy: stub(), data: foo};

      Dom.autoUpdate(ctx, {field: 'foo_ids'});

      assert.calledWith(ctx.onDestroy, obs.firstCall.returnValue);

      const foo2 = TestModel.create();

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

      TestModel.notify({_id: foo._id});

      refute.called(foo.$reload);
    });
  });
});

isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Dom = require('../dom');
  require('./dom-ext');
  var util = require('../util');
  var Model = require('../model/main');
  var session = require('../session/base');

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
    },
  });
});

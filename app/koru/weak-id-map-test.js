isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./weak-id-map');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test custom key": function () {
      var wm = new sut('foo');

      var o1 = {foo: '1'};
      var o2 = {foo: '2'};

      wm.set(o1);
      wm.set(o2);

      assert.same(wm.get(1), o1);
      assert.same(wm.get('2'), o2);
    },

    "test crud": function () {
      var wm = new sut();

      var o1 = {_id: 'a'};
      var o2 = {_id: 'b'};

      wm.set(o1).set(o2);

      assert.same(wm.get('b'), o2);
      assert.same(wm.get('a'), o1);

      wm.delete(o1);
      assert.same(wm.get('a'), undefined);
      assert.same(wm.get('b'), o2);
      wm.delete('b');
      assert.same(wm.get('b'), undefined);
    },

    "test clear": function () {
      var wm = new sut();

      var o1 = {_id: 'a'};
      var o2 = {_id: 'b'};

      wm.set(o1).set(o2);

      wm.clear();
      assert.same(wm.get('a'), undefined);
      assert.same(wm.get('b'), undefined);
    },
  });
});

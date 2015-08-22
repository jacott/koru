isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./key-map');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.km = sut({
        foo: ["X", v.foo = test.stub()],
        bar: ["QX1", v.bar = test.stub()],
        bar2: ["QX2", v.bar2 = test.stub()],
      });
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "test config": function () {
      assert.equals(v.km.map, {88: ['foo', v.foo], 81: {88: {49: ['bar', v.bar], 50: ['bar2', v.bar2]}}});
    },

    "test single key": function () {
      var event = TH.buildEvent('keydown', {which: 88});
      v.km.exec(event);
      assert.calledOnce(v.foo);
      refute.called(v.bar);
    },

    "test multi key": function () {
      v.km.exec(TH.buildEvent('keydown', {which: 81}));
      TH.keydown(document.body, "X1");
      assert.calledOnce(v.bar);
      refute.called(v.bar2);
    },
  });
});

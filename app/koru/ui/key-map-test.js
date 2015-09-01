isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./key-map');
  var Dom = require('../dom');
  var util = require('../util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.km = sut({
        foo: ["X", v.foo = test.stub()],
        bar: ["QX1", v.bar = test.stub()],
        mbar2: ["Q"+sut.ctrl+sut.shift+"2", v.mbar2 = test.stub()],
        bar2: ["QX2", v.bar2 = test.stub()],
        foo2: [sut.ctrl+'A', v.foo2 = test.stub()],
      });
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "test config": function () {
      assert.equals(v.km.map,
                    {X: ['foo', v.foo], Q: {'\u0003': {2: ['mbar2', v.mbar2]}, X: {1: ['bar', v.bar], 2: ['bar2', v.bar2]}},
                     '\u0002': {A: ['foo2', v.foo2]}});
    },

    "test single key": function () {
      var event = TH.buildEvent('keydown', {which: 88});
      v.km.exec(event);
      assert.calledOnce(v.foo);
      refute.called(v.bar);
    },

    "test multi key": function () {
      v.km.exec(TH.buildEvent('keydown', {which: 81}));
      TH.keydown("X1");
      assert.calledOnce(v.bar);
      refute.called(v.bar2);
    },

    "test modifier keys": function () {
      v.km.exec(TH.buildEvent('keydown', {which: 81}));
      TH.keydown(sut.shift+sut.ctrl+sut.alt);
      TH.keyup(sut.alt);
      TH.keydown('2');
      assert.calledOnce(v.mbar2);
      refute.called(v.bar2);
    },

    "test modifier first key": function () {
      v.km.exec(TH.buildEvent('keydown', {which: 17}));
      TH.keydown('A');
      assert.calledOnce(v.foo2);
    },

    "test invalid modifier key": function () {
      var elm = Dom.html({tag: 'button'});
      document.body.appendChild(elm);
      elm.addEventListener('keydown', v.stub = test.stub());
      test.onEnd(function () {
        elm.removeEventListener('keydown', v.stub);
      });
      v.km.exec(TH.buildEvent('keydown', {which: 81}));
      TH.keydown(elm, sut.shift+'W');
      refute.called(v.stub);
      TH.keydown(elm, 'X');
      assert.calledOnce(v.stub);
      refute.called(v.foo);
    },

    "test input focused": function () {
      test.spy(Dom, 'matches');
      document.body.appendChild(Dom.html({tag: 'input', type: 'text'}));
      assert.dom('input', function () {
        this.focus();
        var event = TH.buildEvent('keydown', {which: 88});
        v.km.exec(event);
        refute.called(v.foo);
        assert.calledWith(Dom.matches, this, Dom.INPUT_SELECTOR);
        var event = TH.buildEvent('keydown', {which: 88});
        v.km.exec(event, 'ignoreFocus');
        assert.called(v.foo);
      });
    },
  });
});

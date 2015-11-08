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

    "test key codes": function () {
      assert.same(sut.left, '%');
      assert.same(sut.up, '&');
      assert.same(sut.down, '(');
      assert.same(sut.right, '\'');
    },

    "test config": function () {
      assert.equals(v.km.map,
                    {X: ['foo', v.foo], Q: {'\u0003': {2: ['mbar2', v.mbar2]}, X: {1: ['bar', v.bar], 2: ['bar2', v.bar2]}},
                     '\u0002': {A: ['foo2', v.foo2]}});
    },

    "test getTitle": function () {
      assert.same(v.km.getTitle('foo desc', 'foo'), "foo desc [X]");
      assert.same(v.km.getTitle('no key desc', 'nk'), "no key desc");

      assert.equals(v.km.descMap, {foo: ['X', v.foo, 'foo desc [X]'], bar: ['QX1', v.bar], mbar2: ['Q\u0011\u00102', v.mbar2],
                                   bar2: ['QX2', v.bar2], foo2: ['\u0011A', v.foo2], nk: ['', null, 'no key desc']});

      assert.same(v.km.getTitle('mbar2 desc', 'mbar2'), "mbar2 desc [Qctrl-shift-2]");

      v.km.addKeys({
        home: [sut.home, test.stub()],
        end: [sut.end, test.stub()],
        pgdn: [sut.pgDown, test.stub()],
        pgup: [sut.pgUp, test.stub()],
      });

      assert.same(v.km.getTitle('home', 'home'), "home [<home>]");
      assert.same(v.km.getTitle('end', 'end'), "end [<end>]");
      assert.same(v.km.getTitle('pgdn', 'pgdn'), "pgdn [<pgDown>]");
      assert.same(v.km.getTitle('pgup', 'pgup'), "pgup [<pgUp>]");
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
      TH.keydown('2', {shiftKey: true, ctrlKey: true});
      assert.calledOnce(v.mbar2);
      refute.called(v.bar2);
    },

    "test modifier first key": function () {
      v.km.exec(TH.buildEvent('keydown', {ctrlKey: true, which: 'A'.charCodeAt(0)}));
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
      TH.keydown(elm, 'W', {shiftKey: true});
      assert.called(v.stub);
      TH.keydown(elm, 'X');
      assert.calledTwice(v.stub);
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

isClient && define((require, exports, module)=>{
  const Dom             = require('../dom');
  const util            = require('../util');
  const sut             = require('./key-map');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd, stubProperty} = TH;

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach( ()=>{
      v.km = sut({
        foo: ["X", v.foo = stub()],
        bar: ["QX1", v.bar = stub()],
        mbar2: ["Q"+sut.ctrl+sut.shift+"2", v.mbar2 = stub()],
        bar2: ["QX2", v.bar2 = stub()],
        foo2: [sut.ctrl+'A', v.foo2 = stub()],
        foo3: [sut.meta+'A', sut.alt+'B', sut.meta+'B', v.foo3 = stub()],
      });
    });

    afterEach( ()=>{
      TH.domTearDown();
    });

    test("key codes",  ()=>{
      assert.same(sut.left, '%');
      assert.same(sut.up, '&');
      assert.same(sut.down, '(');
      assert.same(sut.right, '\'');
      assert.same(sut.del, '.');
    });

    test("modDisplay", ()=>{
      assert.same(sut.usesCommandKey, /Macintosh/.test(navigator.userAgent));
      stubProperty(sut, 'usesCommandKey', {value: true});
      assert.same(sut.modDisplay('Ctrl'), "⌘");
      assert.same(sut.modDisplay('ctrl'), "⌘");
      assert.same(sut.modDisplay('CTRL'), "⌘");

      sut.usesCommandKey = false;

      assert.same(sut.modDisplay('Ctrl'), "Ctrl");
    });

    test("config",  ()=>{
      assert.equals(v.km.map, {
        X: ['foo', v.foo],
        Q: {
          '*\u0003': {2: ['mbar2', v.mbar2]},
          X: {1: ['bar', v.bar], 2: ['bar2', v.bar2]}
        },
        '*\u0002': {A: ['foo2', v.foo2]},
        '*\u0004': {B: ['foo3', v.foo3]},
        '*\u0008': {A: ['foo3', v.foo3], B: ['foo3', v.foo3]}
      });
    });

    test("getTitle",  ()=>{
      assert.same(v.km.getTitle('foo desc', 'foo'), "foo desc [X]");
      assert.same(v.km.getTitle('no key desc', 'nk'), "no key desc");

      assert.equals(v.km.descMap, {
        foo: ['X', v.foo, 'foo desc [X]'],
        bar: ['QX1', v.bar],
        mbar2: ['Q\u0011\u00102', v.mbar2],
        bar2: ['QX2', v.bar2],
        foo2: ['\u0011A', v.foo2],
        foo3: ['[A', v.foo3],
        nk: ['', null, 'no key desc']});

      assert.same(v.km.getTitle('mbar2 desc', 'mbar2'), "mbar2 desc [Qctrl-shift-2]");

      const f = ()=>{};

      v.km.addKeys({
        home: [sut.home, f],
        end: [sut.end, f],
        pgdn: [sut.pgDown, f],
        pgup: [sut.pgUp, f],
        esc: [sut.esc, f],
        space: [' ', f],
        lbkt: ['Û', f],
        rbkt: ['Ý', f],
        bslash: ['Ü', f],
        grave: ['À', f],
      });

      assert.same(sut.space, ' ');

      assert.same(v.km.getTitle('home', 'home'), "home [<home>]");
      assert.same(v.km.getTitle('end', 'end'), "end [<end>]");
      assert.same(v.km.getTitle('pgdn', 'pgdn'), "pgdn [<pgDown>]");
      assert.same(v.km.getTitle('pgup', 'pgup'), "pgup [<pgUp>]");
      assert.same(v.km.getTitle('esc', 'esc'), "esc [<esc>]");
      assert.same(v.km.getTitle('space', 'space'), "space [<space>]");
      assert.same(v.km.getTitle('lbkt', 'lbkt'), "lbkt [[]");
      assert.same(v.km.getTitle('rbkt', 'rbkt'), "rbkt []]");
      assert.same(v.km.getTitle('bslash', 'bslash'), "bslash [\\]");
      assert.same(v.km.getTitle('grave', 'grave'), "grave [`]");
    });

    test("mapCtrlToMeta", ()=>{
      const f = ()=>{};
      const km = sut({
        f1: [sut.ctrl+"A", f],
        f2: [sut.shift+"B", f],
      }, {mapCtrlToMeta: true});

      km.addKeys({
        f3: [sut.shift+sut.ctrl+"C", sut.ctrl+"X", f],
        f4: [sut.ctrl+sut.meta+"D", f],
      }, {mapCtrlToMeta: true});

      km.addKeys({
        f5: [sut.shift+sut.ctrl+"E", f],
      });

      assert.equals(km.map, {
        '*\u0002': {A: ['f1', f], X: ['f3', f]},
        '*\u0001': {B: ['f2', f]},
        '*\u0003': {C: ['f3', f], E: ['f5', f]},
        '*\u0008': {A: ['f1', f], X: ['f3', f]},
        '*\u0009': {C: ['f3', f]},
        '*\u000a': {D: ['f4', f]}});
    });

    test("single key",  ()=>{
      const event = TH.buildEvent('keydown', {which: 88});
      v.km.exec(event);
      assert.calledOnceWith(v.foo, TH.match(ev => ev.which === 88), 'foo');
      refute.called(v.bar);
    });

    test("multi key",  ()=>{
      v.km.exec(TH.buildEvent('keydown', {which: 81}));
      TH.keydown("X1");
      assert.calledOnceWith(v.bar, TH.match(ev => ev.type === 'keydown' && ev.which === 49), 'bar');
      refute.called(v.bar2);
    });

    test("modifier keys",  ()=>{
      v.km.exec(TH.buildEvent('keydown', {which: 81}));
      TH.keydown('2', {shiftKey: true, ctrlKey: true});
      assert.calledOnce(v.mbar2);
      refute.called(v.bar2);
    });

    test("secondary keys", ()=>{
      v.km.exec(TH.buildEvent('keydown', {which: 'B'.charCodeAt(0), metaKey: true}));
      assert.calledOnce(v.foo3);
      v.km.exec(TH.buildEvent('keydown', {which: 'A'.charCodeAt(0), metaKey: true}));
      assert.calledTwice(v.foo3);
      v.km.exec(TH.buildEvent('keydown', {which: 'B'.charCodeAt(0), altKey: true}));
      v.km.exec(TH.buildEvent('keydown', {which: 'A'.charCodeAt(0), altKey: true}));
      assert.calledThrice(v.foo3);
    });

    test("modifier first key",  ()=>{
      v.km.exec(TH.buildEvent('keydown', {ctrlKey: true, which: 'A'.charCodeAt(0)}));
      assert.calledOnce(v.foo2);
    });

    test("invalid modifier key",  ()=>{
      const elm = Dom.h({button: ''});
      document.body.appendChild(elm);
      elm.addEventListener('keydown', v.stub = stub());
      onEnd(()=>{elm.removeEventListener('keydown', v.stub)});

      v.km.exec(TH.buildEvent('keydown', {which: 81}));
      TH.keydown(elm, 'W', {shiftKey: true});
      assert.called(v.stub);
      TH.keydown(elm, 'X');
      assert.calledTwice(v.stub);
      refute.called(v.foo);
    });

    test("input focused",  ()=>{
      spy(Dom, 'matches');
      document.body.appendChild(Dom.h({input: '', $type: 'text'}));
      assert.dom('input', function () {
        this.focus();
        let event = TH.buildEvent('keydown', {which: 88});
        v.km.exec(event);
        refute.called(v.foo);
        assert.calledWith(Dom.matches, this, Dom.INPUT_SELECTOR);
        event = TH.buildEvent('keydown', {which: 88});
        v.km.exec(event, 'ignoreFocus');
        assert.called(v.foo);
      });
    });
  });
});

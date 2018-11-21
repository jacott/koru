isClient && define((require, exports, module)=>{
  const Dom             = require('../dom');
  const koru            = require('../main');
  const TH              = require('../ui/test-helper');

  const {stub, spy, onEnd, match: m} = TH;

  const sut = require('./plain-text');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      Dom.removeChildren(document.body);
      v = {};
    });

    test("buildKeydownEvent", ()=>{
      const elm = document.createElement('div');
      const cb = {cancel: stub(), okay: stub()};
      const keydown = sut.buildKeydownEvent(cb);

      stub(Dom, 'stopEvent');

      keydown.call(elm, {which: 27});
      assert.calledWith(cb.cancel, elm, {which: 27});
      refute.called(Dom.stopEvent);
      cb.cancel.reset();

      keydown({which: 66, ctrlKey: true});
      assert.calledOnce(Dom.stopEvent);
      keydown({which: 85, ctrlKey: true});
      keydown({which: 73, ctrlKey: true});

      assert.same(Dom.stopEvent.callCount, 3);
      Dom.stopEvent.reset();

      keydown({which: 74, ctrlKey: true});
      refute.called(Dom.stopEvent);

      refute.called(cb.cancel);
      refute.called(cb.okay);

      keydown.call(elm, {which: 13});
      assert.calledWith(cb.okay, elm, {which: 13});
      assert.calledOnce(Dom.stopEvent);
    });

    test("editor", ()=>{
      document.body.appendChild(sut.Editor.$autoRender({content: "foo", options: {
        placeholder: "hello"}}));
      assert.dom('.input.plainText[contenteditable=true][placeholder=hello]', function () {
        assert.same(this.textContent, "foo");
        spy(Dom, 'stopEvent');
        TH.trigger(this, 'keydown', {which: 66});
        TH.trigger(this, 'keydown', {which: 85});
        TH.trigger(this, 'keydown', {which: 73});
        refute.called(Dom.stopEvent);
        TH.trigger(this, 'keydown', {which: 66, ctrlKey: true});
        TH.trigger(this, 'keydown', {which: 85, ctrlKey: true});
        TH.trigger(this, 'keydown', {which: 73, ctrlKey: true});
        assert.calledThrice(Dom.stopEvent);
      });
    });

    group("paste", ()=>{
      beforeEach(()=>{
        v.ec = stub(document, 'execCommand');
        document.body.appendChild(sut.Editor.$autoRender({content: ""}));

        v.event = {};

        v.input = Dom('.input');

        v.slot = TH.findDomEvent(sut.Editor, 'paste')[0];
        v.origPaste = v.slot[2];
        v.paste = function (event) {
          return v.origPaste.call(v.input.parentNode, event);
        };
        stub(Dom, 'stopEvent');
        v.insert = stub(sut.Editor, 'insert').returns(true);
      });

      afterEach(()=>{
      });

      test("wiried", ()=>{
        assert.equals(v.slot, ['paste', '', v.origPaste]);
        assert.same(sut.pasteFilter, v.origPaste);
      });

      test("text/html", ()=>{
        const getData = stub();
        getData.withArgs('text/html').returns('<b>bold</b>\nworld');
        getData.withArgs('text/plain').returns('bold\nworld');
        v.event.clipboardData = {
          types: ['text/plain', 'text/html'],
          getData,
        };

        const elm = Dom.h({});

        v.paste(v.event);
        assert.called(Dom.stopEvent);
        assert.calledWith(v.insert, TH.match(h => (
          elm.appendChild(h),
          assert.equals(elm.innerHTML, 'bold<br>world'),
          true)));
      });

      test("safari public.rtf", ()=>{
        const getData = stub();
        getData.withArgs('text/plain').returns(
          'should not need this');
        getData.withArgs('public.rtf').returns('whatever');
        v.event.clipboardData = {
          types: ['text/plain', 'public.rtf'],
          getData,
        };

        v.paste(v.event);

        refute.called(Dom.stopEvent);
        refute.called(v.insert);
      });

      test("text/plain", ()=>{
        v.event.clipboardData = {
          types: ['text/plain'],
          getData: stub().withArgs('text/plain').returns(
            'containshttps://nolink https:/a/link'),
        };

        v.paste(v.event);

        refute.called(Dom.stopEvent);
        refute.called(v.insert);
      });

      test("no clipboard", ()=>{
        delete v.event.clipboardData;

        v.paste(v.event);

        refute.called(Dom.stopEvent);
      });
    });

    group("fromHtml", ()=>{
      beforeEach(()=>{
        v.c = function (html) {
          return sut.fromHtml(Dom.textToHtml(html));
        };
      });

      test("null", ()=>{
        assert.same(sut.fromHtml(null), '');
      });

      test("complex", ()=>{
        assert.same(v.c(
          "<div><b>So <i>m</i> e</b> Text<div><br></div><div>As <i>html</i>  Test</div>" +
            "<div>ing with<br></div><div><br></div><div> spaces</div></div>"),
                    'So m e Text\n\nAs html  Test\ning with\n\n spaces');
      });

      test("buttons", ()=>{
        assert.same(v.c(
          '<div>Hello <span data-a="j2">Josiah&lt;JG&gt;</span></div>'), 'Hello Josiah<JG>');
        assert.same(v.c(
          '<div>Hello <span data-h="s1">Foo <b>bar</b></span></div>'), 'Hello Foo bar');
      });
    });

    test("toHtml", ()=>{
      const elm = document.createElement('div');
      elm.appendChild(sut.toHtml("  hello world\n\nhow now\nbrown cow"));
      elm.appendChild(sut.toHtml());
      assert.same(elm.innerHTML, '  hello world<br><br>how now<br>brown cow');
    });
  });
});

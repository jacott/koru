isClient && define((require, exports, module)=>{
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const RichTextEditorTpl = require('koru/html!./rich-text-editor-test');
  const util            = require('koru/util');
  const session         = require('../session/client-rpc');
  const KeyMap          = require('./key-map');
  const Modal           = require('./modal');
  const RichText        = require('./rich-text');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd, match: m} = TH;

  const sut               = require('./rich-text-editor');

  const {ctrl} = KeyMap;

  let v ={};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.tpl = Dom.newTemplate(util.deepCopy(RichTextEditorTpl));
    });

    afterEach(()=>{
      TH.domTearDown();
      v = {};
    });

    test("attrs helper", ()=>{
      const elm = sut.$autoRender({
        content: '', options: {
          class: 'foo bar', id: 'FOO', type: 'RichTextEditor',
          placeholder: 'place holder text',
          $other: 'x', 'data-foo': 'daf',
        }
      });
      assert.dom(elm, function () {
        assert.same(this.className, 'foo bar richTextEditor');
        assert.same(this.getAttribute('$other'), null);
        assert.same(this.getAttribute('type'), null);
        assert.same(this.getAttribute('data-foo'), 'daf');
        assert.same(this.id, 'FOO');
        assert.dom('.input[placeholder="place holder text"]');
      });
    });

    test("get/set value", ()=>{
      document.body.appendChild(v.tpl.$autoRender({content: null}));

      assert.dom('.input', function () {
        assert.same(this.firstChild, null);
        this.parentNode.value = Dom.h({b: 'bold'});
        assert.same(this.firstChild.textContent, 'bold');
        this.parentNode.value = null;
        assert.same(this.firstChild, null);
      });
    });

    test("focus", ()=>{
      stub(document, 'execCommand');
      document.body.appendChild(sut.$autoRender({
        content: '', options: {focusout: v.focusout = stub()}}));

      assert.dom('.richTextEditor:not([focusout])>.input', function () {
        this.focus();
        TH.trigger(this, 'focusin');
        assert.calledWith(document.execCommand, 'styleWithCSS', false, true);
        assert.className(this.parentNode, 'focus');
        TH.keydown(this, 'O', {ctrlKey: true, shiftKey: true});

        TH.trigger(this, 'focusout', {relatedTarget: document.body});
        assert.className(this.parentNode, 'focus');
        Dom.remove(Dom('.glassPane'));
        refute.called(v.focusout);

        document.activeElement.blur();
        TH.trigger(this, 'focusout', {relatedTarget: document.body});
        refute.className(this.parentNode, 'focus');
        assert.called(v.focusout);
      });
    });

    test("bold, italic, underline, strikeThrough", ()=>{
      v.ec = stub(document, 'execCommand');

      document.body.appendChild(v.tpl.$autoRender({content: ''}));

      assert.dom('.input', input =>{
        TH.keydown(input, 'B', {ctrlKey: true});
        TH.keydown(input, 'B', {ctrlKey: false});
        assert.calledOnceWith(v.ec, 'bold');

        TH.keydown(input, 'I', {ctrlKey: true});
        assert.calledWith(v.ec, 'italic');

        TH.keydown(input, 'U', {ctrlKey: true});
        assert.calledWith(v.ec, 'underline');

        TH.keydown(input, '5', {altKey: true, shiftKey: true});
        assert.calledWith(v.ec, 'strikeThrough');
      });
    });

    test("heading", ()=>{
      v.ec = stub(document, 'execCommand');

      const assertKey = (key)=>{
        TH.keydown(input, key, {altKey: true, ctrlKey: true});
        assert.calledWith(v.ec, 'formatBlock', false, 'H'+key);
      };
      document.body.appendChild(v.tpl.$autoRender({content: ''}));

      const input = Dom('.input');

      TH.keydown(input, '0', {altKey: true, ctrlKey: true});
      assert.calledWith(v.ec, 'formatBlock', false, 'div');
    });

    group("pre", ()=>{
      beforeEach(()=>{
        document.body.appendChild(v.tpl.$autoRender({content: ''}));
        v.selectCode = ()=>{
          const node = Dom('.input pre>div').firstChild;
          const range = TH.setRange(node, 2);
          TH.keyup(node, 39);
          return range;
        };
      });

      test("load languages", ()=>{
        const langs = stub(session, 'rpc').withArgs('RichTextEditor.fetchLanguages');
        assert.dom('.input', function () {
          this.appendChild(Dom.h({pre: {div: "one\ntwo"}}));
          sut.languageList = null;
          const elm = v.selectCode().startContainer;
          onEnd(sut.$ctx(this).caretMoved.onChange(v.caretMoved = stub()).stop);
        });

        assert.called(langs);
        refute.called(v.caretMoved);
        langs.yield(null, [['c', 'C'], ['ruby', 'Ruby']]);
        assert.called(v.caretMoved);
        assert.equals(sut.languageList, [['c', 'C'], ['ruby', 'Ruby']]);
        assert.equals(sut.languageMap, {c: 'C', ruby: 'Ruby'});

      });

      test("set language", ()=>{
        assert.dom('.input', function () {
          this.focus();
          this.appendChild(Dom.h({pre: {div: "one\ntwo"}}));
          sut.languageList = [['c', 'C'], ['ruby', 'Ruby']];
          const elm = v.selectCode().startContainer;
          TH.keydown(elm, 'L', {ctrlKey: true});
          onEnd(sut.$ctx(this).caretMoved.onChange(v.caretMoved = stub()).stop);
        });

        assert.dom('.glassPane', function () {
          assert.dom('li', 'C');
          TH.click('li', 'Ruby');
        });

        assert.dom('pre[data-lang="ruby"]');
      });

      test("syntax highlight", ()=>{
        const highlight = stub(session, 'rpc').withArgs('RichTextEditor.syntaxHighlight');
        assert.dom('.input', function () {
          this.focus();
          this.appendChild(Dom.h({pre: {div: "if a:\n  (b)\n"}, '$data-lang': 'python'}));
          const elm = v.selectCode().startContainer;
          this.appendChild(Dom.h({div: "after"}));
          assert.dom('pre+div', 'after');
          TH.keydown(elm, 'H', {ctrlKey: true, shiftKey: true});
          onEnd(sut.$ctx(this).caretMoved.onChange(v.caretMoved = stub()).stop);
        });

        assert.calledWith(highlight, 'RichTextEditor.syntaxHighlight', "python", "if a:\n  (b)\n");
        assert.dom('.richTextEditor.syntaxHighlighting');

        highlight.yield(null, [4, 0, 3, 3, 1, 0, 2]);

        assert.dom('pre', function () {
          const rt = RichText.fromHtml(this, {includeTop: true});
          assert.equals(rt[0], 'code:python\nif a:\n  (b)\n');
          assert.equals(rt[1], [4, 0, 3, 3, 1, 0, 2]);
        });
        assert.dom('pre+div', 'after');
        assert.called(v.caretMoved);

        highlight.reset();
        assert.dom('.input>pre>div', function () {
          TH.keydown(this, 'H', {ctrlKey: true, shiftKey: true});
        });
        assert.calledWith(highlight, 'RichTextEditor.syntaxHighlight', "python", "if a:\n  (b)\n");
        highlight.yield(null, [4, 0, 3, 3, 1, 0, 2]);
        assert.dom('pre', function () {
          const rt = RichText.fromHtml(this, {includeTop: true});
          assert.equals(rt[0], 'code:python\nif a:\n  (b)\n');
          assert.equals(rt[1], [4, 0, 3, 3, 1, 0, 2]);
        });


        highlight.reset();
        stub(koru, 'globalCallback');
        assert.dom('.input>pre>div', function () {
          TH.keydown(this, 'H', {ctrlKey: true, shiftKey: true});
        });

        highlight.yield('error');

        assert.dom('pre div>span.k', 'if');
        assert.calledWith(koru.globalCallback, 'error');
      });

      test("on selection", ()=>{
        assert.dom('.input', function () {
          this.focus();
          this.appendChild(Dom.h({ol: [{li: 'hello'}, {li: 'world'}]}));
          assert.dom('ol', function () {
            Dom.selectElm(this);
          });
          TH.keyup(this, 39);
          TH.keydown(this, 'À', {ctrlKey: true});
          sut.insert(' foo');
          assert.dom('pre[data-lang="text"]', 'hello\nworld foo');
          TH.keydown(this, 13);
          TH.keyup(this, 13);
          assert.same(sut.$ctx(this).mode.type, 'code');
          sut.insert('bar');
          assert.dom(RichText.fromToHtml(this.parentNode.value), function () {
            assert.dom('pre[data-lang="text"]>div', 'hello\nworld foo\nbar');
          });
          this.insertBefore(Dom.h({div: "outside"}), this.firstChild);
          TH.setRange(this.firstChild.firstChild, 3);
          TH.keyup(this, 39);
          TH.keydown(this, 13);
          assert.same(this.firstChild.firstChild.textContent, 'outside');
        });
      });

      test("pointerup on/off", ()=>{
        assert.dom('.input', function () {
          this.focus();
          assert.same(sut.$ctx(this).mode.type, 'standard');
          Dom('.richTextEditor').value = Dom.h([{div: "first"}, {pre: "second"}]);
          TH.setRange(this.lastChild, 0);
          TH.pointerDownUp(this);
          assert.same(sut.$ctx(this).mode.type, 'code');
          TH.setRange(this.firstChild, 0);
          TH.pointerDownUp(this);
          assert.same(sut.$ctx(this).mode.type, 'standard');
        });
      });

      test("on empty", ()=>{
        assert.dom('.input', function () {
          this.focus();
          TH.setRange(this);

          TH.keydown(this, KeyMap['`'], {ctrlKey: true});

          assert.dom('pre[data-lang="text"]>div>br');
          sut.insert(' foo');
          assert.dom('pre[data-lang="text"]', 'foo');
        });
      });
    });

    test("fontSize", ()=>{
      document.body.appendChild(v.tpl.$autoRender({
        content: Dom.h([{font: 'bold', $size: "1"},
                        {span: 'big', $style: "font-size: xx-large"}])}));

      assert.dom('.input font', function () {
        this.focus();
        TH.setRange(this.firstChild, 0, this.firstChild, 1);

        sut.$ctx(this).mode.actions.fontSize({target: this.firstChild});
      });

      assert.dom('.glassPane', function () {
        assert.dom('li>font[size="6"]', 'XX large');
        TH.click('li>font[size="2"]', 'Small');
      });

      assert.dom('.input', function () {
        TH.trigger(this, 'input');
        assert.dom('span', 'big', function () {
          assert.same(this.style.fontSize, '2em');
          assert.same(this.style.lineHeight, '1em');
        });
        if(Dom('font>font'))
          assert.dom('font[size="1"]>font[size="2"]', 'b');
        else assert.dom('span', 'b', function () {
          assert.same(this.style.fontSize, '0.8em');
          assert.same(this.style.lineHeight, '1em');
        });
      });
    });

    test("fontColor", ()=>{
      document.body.appendChild(v.tpl.$autoRender({
        content: Dom.h({font: {
          span: 'bold', $style: 'background-color:#ffff00'}, $color: '#0000ff'})}));

      assert.dom('.input font span', function () {
        this.focus();
        TH.trigger(this, 'focusin');
        const range = Dom.getRange();
        assert.same(range.startContainer.parentNode, this);

        TH.setRange(this.firstChild, 0, this.firstChild, 1);

        TH.keydown(this, 'H', {ctrlKey: true, shiftKey: true});
        TH.trigger(this, 'focusout');
      });

      assert.className(Dom('.richTextEditor'), 'focus');


      // set hiliteColor

      assert.dom('#ColorPicker', function () {
        assert.dom('[name=hex]', {value: '0000ff'});
        assert.dom('.fontColor[data-mode="foreColor"]', function () {
          TH.click('[name=hiliteColor]');
          assert.same(this.getAttribute('data-mode'), 'hiliteColor');
          TH.click('[name=foreColor]');
          assert.same(this.getAttribute('data-mode'), 'foreColor');
          TH.click('[name=hiliteColor]');
        });
        assert.dom('[name=hex]', {value: 'ffff00'}, function () {
          TH.input(this, 'ff0000');
        });
        TH.click('[name=apply]');
      });

      refute.dom('#ColorPicker');


      assert.dom('.input', function () {
        document.activeElement.blur();
        TH.trigger(this, 'focusout');
        refute.className(Dom('.richTextEditor'), 'focus');

        assert.dom('*', 'b', function () {
          assert.colorEqual(this.style.backgroundColor, '#ff0000');
        });
        sut.$ctx(this).mode.actions.fontColor({target: this});
      });

      // set foreColor

      assert.dom('#ColorPicker', function () {
        TH.input('[name=hex]', 'f0f0f0');
        TH.click('[name=apply]');
      });

      assert.dom('.input', function () {
        if (Dom('span>span'))
          assert.dom('span>span>span', 'b', function () {
            assert.colorEqual(this.style.backgroundColor, '#ff0000');
            assert.colorEqual(this.parentNode.style.color, '#f0f0f0');
          });
        else assert.dom('span', 'b', function () {
          assert.colorEqual(this.style.color, '#f0f0f0');
          assert.colorEqual(this.style.backgroundColor, '#ff0000');
        });
        sut.$ctx(this).mode.actions.fontColor({target: this});
      });

      // clear background

      assert.dom('#ColorPicker', function () {
        TH.click('[name=removeHilite]');
      });

      refute.dom('#ColorPicker');

      assert.dom('.input', function () {
        if (Dom('span>span'))
          assert.dom('span>span>span', 'b', function () {
            assert.same(window.getComputedStyle(this).backgroundColor, 'rgba(0, 0, 0, 0)');
          });
        else assert.dom('*', 'b', function () {
          assert.colorEqual(window.getComputedStyle(this).backgroundColor, 'rgba(0,0,0,0)');
        });
      });
    });

    test("inline code on selection", ()=>{
      document.body.appendChild(v.tpl.$autoRender({content: RichText.toHtml("1\n2")}));

      assert.dom('.input', function () {
        document.execCommand('styleWithCSS', false, true);
        this.focus();
        TH.setRange(this.lastChild.firstChild, 0, this.lastChild.firstChild, 1);
        TH.keydown(this, 'À', {ctrlKey: true});
        assert.dom('span', '2', function () {
          assert.same(this.style.fontFamily, 'monospace');
        });
        sut.insert('foo');
        assert.dom('span', 'foo', function () {
          assert.same(this.style.fontFamily, 'monospace');
        });

        TH.keydown(this, 'À', {ctrlKey: true});
        sut.insert(' bar');
        assert.dom('span', 'foo', function () {
          assert.same(this.style.fontFamily, 'monospace');
          TH.setRange(this.firstChild, 1);
        });
        assert.dom('span+span', 'bar', function () {
          assert.same(this.style.fontFamily, 'initial');
        });
        TH.keydown(this, 'À', {ctrlKey: true});
        sut.insert('baz');
        assert.dom('span', /^f/, function () {
          assert.same(this.style.fontFamily, 'monospace');
          v.start = this.firstChild;
        });
        assert.dom('span', 'baz', function () {
          assert.same(this.style.fontFamily, 'initial');
        });

        if (Dom('span>span')) {
          assert.dom('span', 'baz', function () {
            assert.same(this.style.fontFamily, 'initial');
            TH.setRange(v.start, 0, this.nextSibling, 1);
          });
          TH.keydown(this, 'À', {ctrlKey: true});
          assert.dom('font[face=initial]', 'fbazo');
        } else {
          assert.dom('span', 'baz', function () {
            assert.same(this.style.fontFamily, 'initial');
            const oo = this.nextSibling;
            assert.same(oo.textContent, 'oo');
            assert.same(oo.style.fontFamily, 'monospace');
            TH.setRange(v.start, 0, oo.firstChild, 1);
          });
          TH.keydown(this, 'À', {ctrlKey: true});
          assert.dom('span', 'o', function () {
            assert.same(this.style.fontFamily, 'monospace');
          });
        }
        const rt = RichText.fromHtml(this);
        rt.push(Dom.h({p: ''}));
        assert.dom(RichText.toHtml.apply(RichText, rt), function () {
          assert.dom('span', 'bar', function () {
            assert.same(this.style.fontFamily, 'initial');
          });
        });
      });
    });

    test("title", ()=>{
      let keyMap = stub(sut.modes.standard.keyMap, 'getTitle');
      sut.title('foo', 'insertOrderedList', 'standard');
      assert.calledWith(keyMap, 'foo', 'insertOrderedList');

      keyMap = stub(sut.modes.code.keyMap, 'getTitle');
      sut.title('foo', 'bar', 'code');
      assert.calledWith(keyMap, 'foo', 'bar');
    });

    test("lists", ()=>{
      v.ec = stub(document, 'execCommand');

      document.body.appendChild(v.tpl.$autoRender({content: ''}));

      assert.dom('.input', function () {
        TH.keydown(this, '7', {ctrlKey: true, shiftKey: true});
        assert.calledOnceWith(v.ec, 'insertOrderedList');

        TH.keydown(this, '8', {ctrlKey: true, shiftKey: true});
        assert.calledWith(v.ec, 'insertUnorderedList');
      });
    });

    test("textAlign", ()=>{
      v.ec = stub(document, 'execCommand');

      document.body.appendChild(v.tpl.$autoRender({content: ''}));

      assert.dom('.input', function () {
        TH.keydown(this, 'L', {ctrlKey: true, shiftKey: true});
        assert.calledOnceWith(v.ec, 'justifyLeft');
        v.ec.reset();

        TH.keydown(this, 'E', {ctrlKey: true, shiftKey: true});
        assert.calledOnceWith(v.ec, 'justifyCenter');
        v.ec.reset();

        TH.keydown(this, 'R', {ctrlKey: true, shiftKey: true});
        assert.calledOnceWith(v.ec, 'justifyRight');
        v.ec.reset();

        TH.keydown(this, 'J', {ctrlKey: true, shiftKey: true});
        assert.calledOnceWith(v.ec, 'justifyFull');
      });
    });

    test("removeFormat", ()=>{
      document.body.appendChild(v.tpl.$autoRender({content: Dom.h({b: 'foo'})}));

      assert.dom('.input', function () {
        assert.dom('b', function () {
          TH.setRange(this.firstChild, 0, this.firstChild, 3);
        });

        TH.keydown(this, 'Ü', {ctrlKey: true});

        refute.dom('b');
      });
    });

    test("indent, outdent", ()=>{
      v.ec = stub(document, 'execCommand');
      const keyMap = spy(sut.modes.standard.keyMap, 'exec');

      document.body.appendChild(v.tpl.$autoRender({content: ''}));

      assert.dom('.input', function () {
        TH.keydown(this, 'Ý', {ctrlKey: true});
        assert.calledWith(v.ec, 'indent');

        TH.keydown(this, 'Û', {ctrlKey: true});
        assert.calledWith(v.ec, 'outdent');
      });

      assert.calledWith(keyMap, m.any, 'ignoreFocus');
    });

    group("paste", ()=>{
      beforeEach(()=>{
        v.ec = stub(document, 'execCommand');
        const getData = stub();
        getData.withArgs('text/html').returns('<b>bold</b> world');
        getData.withArgs('text/plain').returns('bold world');
        v.event = {
          clipboardData: {
            types: ['text/plain', 'text/html'],
            getData,
          },
        };

        document.body.appendChild(v.tpl.$autoRender({content: ''}));
        v.input = Dom('.input');
        const topCtx = Dom.myCtx(v.input.parentNode);

        v.slot = TH.findDomEvent(sut, 'paste')[0];
        v.origPaste = v.slot[2];
        v.paste = function (event) {
          const origCtx = Dom.current.ctx;
          Dom.current._ctx = topCtx;
          try {
            return v.origPaste.call(v.input.parentNode, event);
          } finally {
            Dom.current._ctx = origCtx;
          }
        };
        stub(Dom, 'stopEvent');


        v.insertHTML = v.ec.withArgs('insertHTML');
        v.insertText = v.ec.withArgs('insertText').returns(true);
      });

      afterEach(()=>{
      });

      test("wiried", ()=>{
        assert.equals(v.slot, ['paste', '', v.origPaste]);
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

        refute.called(v.insertText);
        refute.called(Dom.stopEvent);
      });

      test("plain text", ()=>{
        v.event.clipboardData = {
          types: ['text/plain'],
          getData: stub().withArgs('text/plain').returns(
            'containshttps://nolink https:/a/link'),
        };

        v.paste(v.event);

        assert.calledWith(v.insertText, 'insertText', false,
                          'containshttps://nolink https:/a/link');
      });

      test("text hyperlinks", ()=>{
        sut.handleHyperLink = (text)=>{
          if (text === 'https://real/link')
            return Dom.h({a: 'my link', $href: 'http://foo'});
        };
        onEnd(()=>{sut.handleHyperLink = null});
        v.event.clipboardData = {
          types: ['text/plain'],
          getData: stub().withArgs('text/plain').returns(
            'contains\n ahttps://false/link and a https://real/link as\nwell'),
        };

        v.paste(v.event);

        assert.calledWith(v.insertHTML, 'insertHTML', false, m(html => v.html = html));

        assert.match(v.html, />contains<.*<a.*href="http:\/\/foo"/);
        assert.match(v.html, /<a [^>]*target="_blank"/);
      });

      test("no clipboard", ()=>{
        delete v.event.clipboardData;

        v.paste(v.event);

        refute.called(Dom.stopEvent);
      });

      test("no insertHTML", ()=>{
        v.insertHTML.returns(false);

        v.paste(v.event);

        assert.calledWith(v.insertText, 'insertText', false, 'bold world');
        assert.called(Dom.stopEvent);
      });

      test("insertHTML", ()=>{
        v.insertHTML.returns(true);

        v.paste(v.event);
        assert.called(Dom.stopEvent);

        refute.called(v.insertText);
        assert.calledWith(v.insertHTML, 'insertHTML', false,
                          '<div><span style=\"font-weight: bold;\">bold</span> world</div>');
      });

      test("pre", ()=>{
        v.insertHTML.returns(true);
        v.input.parentNode.value = Dom.h({pre: {div: 'paste before'}});
        assert.dom('.input', function () {
          assert.dom('pre>div', function () {
            this.focus();
            TH.setRange(this.firstChild, 0);
            TH.keyup(this, 39);
            v.paste(v.event);
            assert.calledWith(v.insertHTML, 'insertHTML', false, 'bold world');
          });
          sut.$ctx(this).mode.paste('<b>bold</b>\nplain<br>newline');
          assert.calledWith(v.insertHTML, 'insertHTML', false, 'bold\nplain\nnewline');
        });
      });
    });

    test("empty", ()=>{
      document.body.appendChild(v.tpl.$autoRender({content: RichText.toHtml('hello\nworld')}));
      Dom.flushNextFrame();

      assert.dom('.input[contenteditable=true]', function () {
        Dom.removeChildren(this);
        this.appendChild(Dom.h({br: null}));
        TH.trigger(this, 'input');
        assert.same(this.firstChild, null);
      });
    });

    test("blockquote", ()=>{
      document.body.appendChild(v.tpl.$autoRender({content: RichText.toHtml('hello\nworld')}));

      Dom.flushNextFrame();

      assert.dom('.input[contenteditable=true]', function () {
        this.focus();
        TH.setRange(this.firstChild.firstChild, 0);
        TH.keydown(this, KeyMap[']'], {ctrlKey: true});
        assert.dom('blockquote', 'hello', function () {
          assert.same(this.getAttribute('style'), null);
        });
      });
    });

    group("links", ()=>{
      beforeEach(()=>{
        document.body.appendChild(v.tpl.$autoRender({
          content: Dom.h([{b: "Hello"}, " ", {a: "world", $href: "/#/two"}])}));

        Dom.flushNextFrame();
      });

      test("changing a link", ()=>{
        assert.dom('a', 'world', function () {
          TH.setRange(this.firstChild, 3);
          v.pos = this.getBoundingClientRect();
        });

        TH.keydown('.input', "K", {ctrlKey: true});

        assert.dom('.rtLink', function () {
          assert.dom('.startTab:first-child');
          assert.dom('.endTab:last-child');
          assert(Modal.topModal.handleTab);
          assert.cssNear(this, 'top', v.pos.bottom);
          assert.cssNear(this, 'left', v.pos.left);

          assert.dom('label>input[name=text]', {value: "world"}, function () {
            TH.input(this, "mars");
          });
          assert.dom('label>input[name=link]', {value: '/#/two'}, function () {
            assert.same(document.activeElement, this);

            TH.input(this, 'http://cruel-mars.org');
          });
          TH.trigger(this, 'submit');
        });
        assert.dom('.richTextEditor>.input', function () {
          assert.dom('a[href="http://cruel-mars.org"]', 'mars', function () {
            assert.match(this.previousSibling.textContent, /^[\xa0 ]$/);
            assert.same(this.nextSibling, null);
          });
          assert.same(document.activeElement, this);
          assert.dom('a', {count: 1});
        });
      });

      test("adding link with selection", ()=>{
        assert.dom('b', 'Hello', function () {
          TH.setRange(this.firstChild, 0, this.firstChild, 4);
          v.pos = Dom.getRange().getBoundingClientRect();
        });

        TH.keydown('.input', "K", {metaKey: true});

        assert.dom('.rtLink', function () {
          assert.cssNear(this, 'top', v.pos.bottom);
          assert.cssNear(this, 'left', v.pos.left);

          assert.dom('label>input[name=text]', {value: "Hell"}, function () {
            TH.input(this, "Goodbye");
          });
          assert.dom('label>input[name=link]', {value: ''}, function () {
            assert.same(document.activeElement, this);

            TH.input(this, 'http://cruel-world.org');
          });
          TH.trigger(this, 'submit');
        });
        assert.dom('.richTextEditor>.input', function () {
          assert.dom('a[href="http://cruel-world.org"]', 'Goodbye', function () {
            assert.same(this.nextSibling.textContent, "o");
          });
          assert.same(document.activeElement, this);
          assert.dom('a', {count: 2});
        });
      });

      test("adding link no selection", ()=>{
        assert.dom('b', 'Hello', function () {
          TH.setRange(this.firstChild, 2);
        });

        assert.dom('.richTextEditor>.input', function () {
          TH.keydown(this, "K", {ctrlKey: true});
          assert.isTrue(Dom.ctx(this).openDialog);

          assert.dom(Dom('.rtLink'), function () {
            TH.input('[name=text]', {value: ''}, 'foo');
            TH.input('[name=link]', {value: ''}, 'bar');
            TH.trigger(this, 'submit');
          });

          assert.dom('a[href="bar"]', 'foo', function () {
            assert.same(this.previousSibling.textContent, 'He');
            assert.same(this.nextSibling.textContent, 'llo');
          });

          assert.isFalse(Dom.ctx(this).openDialog);
        });
      });

      test("adding link no caret", ()=>{
        window.getSelection().removeAllRanges();

        TH.keydown('.input', "K", {ctrlKey: true});

        refute.dom('.rtLink');
      });

      test("canceling link", ()=>{
        assert.dom('.richTextEditor>.input', function () {
          v.orig = this.outerHTML;
          assert.dom('b', 'Hello', function () {
            TH.setRange(this.firstChild);
          });
        });

        TH.keydown('.input', "K", {ctrlKey: true});

        assert.dom('.rtLink', function () {
          TH.input('[name=text]', 'foo');
          TH.input('[name=link]', 'bar');
        });

        TH.pointerDownUp('.glassPane');

        refute.dom('.glassPane');

        assert.dom('.richTextEditor>.input', function () {
          assert.same(this.outerHTML, v.orig);
          assert.same(document.activeElement, this);
        });
      });

    });
  });
});

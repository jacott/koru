isClient && define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const DomNav          = require('koru/ui/dom-nav');
  const util            = require('koru/util');
  const Modal           = require('./modal');
  const RichText        = require('./rich-text');
  const RichTextEditor  = require('./rich-text-editor');
  const TH              = require('./test-helper');

  const {stub, spy} = TH;

  const sut = require('./rich-text-editor-toolbar');

  let v= {};

  const focusin = (inputElm)=>{
    inputElm.focus();
    TH.trigger(inputElm, 'focusin');
    TH.trigger(document, 'selectionchange');
  };

  TH.testCase(module, ({after, beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.editor = sut.$autoRender({content: Dom.h([
        {b: "Hello"}, ' ', {i: "world"}, ' ', {a: "the link", $href: "/link.html"}
      ]), options: {id: "Foo"}, extend: {
        mentions: {'@': {
          title: 'Mention someone',
          buttonClass: 'myButton',
          list() {}
        }}}});

      v.origText = v.editor.value;
      document.body.appendChild(v.editor);

    });

    afterEach(()=>{
      TH.domTearDown();
      v = {};
    });

    test("maxlength", ()=>{
      Dom.remove(v.editor);
      const editor = sut.$autoRender({
        content: Dom.h('hello world!'),
        extend: {maxlength: 20},
      });

      assert.dom(editor, ()=>{
        const ctx = Dom.myCtx(editor);
        assert.dom('>:last-child.ui-charCounter', counter =>{
          assert.same(ctx.characterCounter.element, counter);
          assert.dom('span', "12");
          assert.dom('span+span', "20");
        });
      });
    });

    group("with code", ()=>{
      beforeEach(()=>{
        assert.dom('.input', function () {
          this.focus();
          this.appendChild(Dom.h({pre: {div: "one\ntwo"}}));
          const input = this;
          v.selectCode = function () {
            const node = input.querySelector('pre>div').firstChild;
            TH.setRange(node, 2);
            focusin(input);
          };
        });
      });

      test("data-mode", ()=>{
        assert.dom('.rtToolbar[data-mode=standard]');
        v.selectCode();
        assert.dom('.rtToolbar[data-mode=code]>.code', elm =>{
          assert.dom('button[name=language]');
          assert.dom('button[name=syntaxHighlight]');
          assert.dom('button[name=code].on');
        });
      });

      test("set language", ()=>{
        RichTextEditor.languageList = [['c', 'C'], ['lisp', 'Common Lisp, elisp']];

        v.selectCode();

        assert.dom('[name=language]', 'Text', function () {
          TH.pointerDownUp(this);
        });

        assert.dom('.glassPane', function () {
          this.focus();
          assert.dom('li', 'C');
          TH.click('li', 'Common Lisp, elisp');
        });

        assert.dom('.input', function () {
          assert.dom('pre[data-lang="lisp"]');
          assert.same(document.activeElement, this);
        });

        assert.dom('[name=language]', 'Common Lisp');
      });

      test("syntax highlight", ()=>{
        v.selectCode();

        const syntaxHighlight = stub(RichTextEditor.$ctx(Dom('.richTextEditor'))
                                          .mode.actions, 'syntaxHighlight');
        assert.dom('[name=syntaxHighlight]', '', function () {
          TH.pointerDownUp(this);
        });

        assert.called(syntaxHighlight);
      });
    });

    test("undo/redo", ()=>{
      const rte = Dom('#Foo.richTextEditor'), ctx = Dom.myCtx(rte);
      const inputElm = rte.querySelector('.input');
      focusin(inputElm);

      assert.dom(rte, ()=>{
        assert.dom('>.rtToolbar:first-child>span', span =>{
          assert.dom('button[name=undo]', '', e =>{v.undo = e});
          assert.dom('button[name=redo]', '', e =>{v.redo = e});
        });
      });

      const bElm = Dom.h({b: 'bold'});

      assert.same(v.undo.getAttribute('disabled'), 'disabled');
      assert.same(v.redo.getAttribute('disabled'), 'disabled');

      const cmStub = stub();
      after(ctx.caretMoved.onChange(cmStub));

      inputElm.appendChild(bElm);
      ctx.undo.recordNow();
      TH.setRange(bElm.firstChild, 2);
      focusin(inputElm);
      assert.same(v.undo.getAttribute('disabled'), null);
      assert.same(v.redo.getAttribute('disabled'), 'disabled');
      assert.calledWith(cmStub, undefined); cmStub.reset();

      TH.pointerDownUp(v.undo);
      assert.calledWith(cmStub, undefined); cmStub.reset();
      TH.trigger(document, 'selectionchange');
      assert.same(v.undo.getAttribute('disabled'), 'disabled');
      assert.same(v.redo.getAttribute('disabled'), null);

      TH.pointerDownUp(v.redo);
      TH.trigger(document, 'selectionchange');
      assert.same(v.undo.getAttribute('disabled'), null);
      assert.same(v.redo.getAttribute('disabled'), 'disabled');

      TH.pointerDownUp(v.undo);
      TH.trigger(document, 'selectionchange');
      assert.same(v.undo.getAttribute('disabled'), 'disabled');
      assert.same(v.redo.getAttribute('disabled'), null);

      bElm.textContent = 'bald';
      ctx.undo.recordNow();
      TH.trigger(document, 'selectionchange');
      assert.same(v.undo.getAttribute('disabled'), null);
      assert.same(v.redo.getAttribute('disabled'), 'disabled');
    });

    test("rendering", ()=>{
      const inputElm = Dom('#Foo.richTextEditor>.rtToolbar+.input');
      assert.dom('#Foo.richTextEditor', ()=>{
        assert.dom('>.rtToolbar:first-child>div', ()=>{
          assert.dom('button[name=bold]', '', e =>{v.bold = e});
          assert.dom('button[name=italic]', '', e =>{v.italic = e});
          assert.dom('button[name=underline]', '');
          assert.dom('button[name=link]', '', e => {v.link = e});
          assert.dom('button[name=code]', '');
          assert.dom('button[name=strikeThrough]', '');

          assert.dom('button[name=removeFormat]', removeFormat =>{
            // I think the backslash upsets assert.dom
            assert.same(removeFormat.getAttribute('title'), 'Clear formatting [ctrl-\\]');
          });

          assert.dom('button[name=outdent][title="Decrease indent [ctrl-[]"]');
          assert.dom('button[name=indent][title="Increase indent [ctrl-]]"]');
          assert.dom('button[name=insertOrderedList][title="Numbered list [ctrl-shift-7]"]');
          assert.dom('button[name=insertUnorderedList][title="Bulleted list [ctrl-shift-8]"]');
        });

        // check toolbar state after cusor moved
        assert.dom(inputElm, ()=>{
          assert.dom('b', 'Hello', elm =>{
            TH.setRange(elm, 0);
            Dom.ctx(elm).updateAllTags();
            focusin(inputElm);
            assert.className(v.bold, 'on');
            refute.className(v.italic, 'on');
          });
          assert.dom('i', 'world', elm =>{
            TH.setRange(elm, 1);
            Dom.ctx(elm).updateAllTags();
            refute.className(v.italic, 'on');
            focusin(inputElm);
            refute.className(v.bold, 'on');
            assert.className(v.italic, 'on');
          });
          assert.dom('a', 'the link', elm =>{
            TH.setRange(elm, 1);
            Dom.ctx(elm).updateAllTags();
            refute.className(v.link, 'on');
            v.lnbb = v.link.getBoundingClientRect();

            focusin(inputElm);
            refute.className(v.italic, 'on');
            assert.className(v.link, 'on');
          });

        });

        refute.dom('.rtLink');
        TH.pointerDownUp(v.link);

        TH.stubAfTimeout();
      });

      assert.dom('.rtLink', elm =>{
        assert.dom('.startTab:first-child');
        assert.dom('.endTab:last-child');
        assert(Modal.topModal.handleTab);
        TH.click(elm.parentNode);
        assert.dom('input', {value: '/link.html'});
      });

      refute.dom('.rtLink');

      assert.dom('i', 'world', elm =>{
        TH.setRange(elm.firstChild, 3);
        focusin(elm.parentNode);

        assert.className(v.italic, 'on');
        refute.className(v.link, 'on');
      });
    });

    test("changeing href", ()=>{
      assert.dom('a', 'the link', function () {
        TH.setRange(this.firstChild, 1);
        TH.trigger(this, 'keyup');
      });

      TH.pointerDownUp('[name=link]');

      assert.dom('.rtLink', function () {
        assert.dom('[name=link]', function () {
          TH.input(this, 'http://new/value');
        });
        TH.trigger(this, 'submit');
      });
      assert.dom('.richTextEditor>.input', function () {
        assert.dom('a[href="http://new/value"]', 'the link');
        assert.same(document.activeElement, this);
      });
    });

    test("un/making bold", ()=>{
      assert.dom('.richTextEditor>.input', function () {
        this.focus();
        assert.dom('b', 'Hello', function () {
          DomNav.selectNode(this);
        });
      });

      TH.trigger('[name=bold]', 'pointerup');

      assert.dom('.richTextEditor>.input', function () {
        assert.msg('"Hello" should stil be bold if no pointerdown').dom('b', "Hello");
      });

      TH.pointerDownUp('[name=bold]');

      assert.dom('.richTextEditor>.input', function () {
        assert.same(this.innerHTML, 'Hello <i>world</i> <a href=\"/link.html\">the link</a>');
      });
    });

    test("un/making code", ()=>{
      assert.dom('.richTextEditor>.input', function () {
        focusin(this);
        assert.dom('b', 'Hello', function () {
          TH.setRange(this.firstChild, 1, this.firstChild, 3);
        });
        document.execCommand('styleWithCSS', false, true);
      });

      TH.pointerDownUp('[name=code]');

      assert.dom('.richTextEditor>.input b', function () {
        assert.same(this.innerHTML, 'H<span style=\"font-family: monospace;\">el</span>lo');
      });

      if (! util.isFirefox)
        assert.dom('[name=code].on'); // broken in firefox :/
      TH.pointerDownUp('[name=code]');
      assert.dom('[name=code]:not(.on)');
    });

    test("mention button", ()=>{
      assert.dom('b', 'Hello', function () {
        TH.setRange(this.firstChild, 0);
        TH.trigger(this, 'keyup');
      });

      TH.pointerDownUp('button.myButton');

      assert.dom('.rtMention', function () {
        assert.dom('input', {value: ''});
        TH.trigger(this, 'focusout');
      });

      assert.dom('b', 'Hello', function () {
        TH.setRange(this.firstChild, 0, this.firstChild, 5);
        TH.trigger(this, 'keyup');
      });

      TH.pointerDownUp('button.myButton[title="Mention someone"]');

      assert.dom('.rtMention:not(.inline)', function () {
        assert.dom('input', {value: 'Hello'});
      });
    });

    group("font attributes", ()=>{
      beforeEach(()=>{
        assert.dom('b', 'Hello', function () {
          this.focus();
          TH.setRange(this.firstChild, 0, this.firstChild, 3);
          TH.trigger(this, 'keyup');
          document.execCommand('styleWithCSS', false, true);
        });
      });

      test("set fontName", ()=>{
        RichText.mapFontNames({poster: 'foo font'});
        TH.pointerDownUp('.rtToolbar [name=fontName].select.text');

        assert.dom('.glassPane', function () {
          assert.dom('li>font[face="whiteboard"]', 'Whiteboard');
          TH.click('li>font[face="poster"],li>font[face="foo font"]', 'Poster');
        });

        assert.dom('.input', function () {
          assert.dom('b span', 'Hel', function () {
            assert.match(this.style.fontFamily, /^["']?foo\\? font["']?$/);
          });
        });

        assert.dom('[name=fontName]', 'Poster');

        TH.pointerDownUp('.rtToolbar [name=fontName]');

        assert.dom('.glassPane', function () {
          TH.click('li>font[face="handwriting"]', 'Handwriting');
        });
        assert.dom('[name=fontName]', 'Handwriting');

        assert.dom('.input', function () {
          document.execCommand('insertText', false, 'x');
          assert.dom('b span', 'x', function () {
            assert.equals(this.style.fontFamily, 'handwriting');
          });
        });

        assert.dom('[name=fontName]', 'Handwriting');

        TH.pointerDownUp('.rtToolbar [name=fontName]');

        assert.dom('.glassPane', function () {
          TH.click('li>font[face="sans-serif"]', 'Sans serif');
        });

        assert.dom('[name=fontName]', 'Sans serif');
      });

      test("set fontSize", ()=>{
        TH.pointerDownUp('.rtToolbar [name=fontSize].select');

        assert.dom('.glassPane', function () {
          TH.click('li>font[size="4"]', 'Large');
        });

        assert.dom('.input', function () {
          if (Dom('font[size]'))
            assert.dom('b font[size="4"]', 'Hel');
          else  assert.dom('b span', 'Hel', function () {
            assert.same(this.style.fontSize, '1.2em');
          });
        });
      });

      test("set textAlign", ()=>{
        TH.pointerDownUp('.rtToolbar [name=textAlign].select');

        assert.dom('.glassPane .rtTextAlign', function () {
          assert.dom('li>[name=justifyLeft]');
          assert.dom('li>[name=justifyCenter]', function () {
            assert.same(this.getAttribute('title'), 'Center [ctrl-shift-E]');
          });
          assert.dom('li>[name=justifyRight]');
          TH.click('li>[name=justifyFull]');
        });

        assert.dom('.input', function () {
          assert.dom('div b', 'Hello', function () {
            assert.same(this.parentNode.style.textAlign, 'justify');
          });
        });
      });

      test("set fontColor", ()=>{
        TH.pointerDownUp('.rtToolbar [name=fontColor].select');

        assert.dom('#ColorPicker', function () {
          TH.input('[name=hex]', '00ff00');
          TH.click('[name=apply]');
        });

        assert.dom('.input', function () {
          assert.dom('b span', 'Hel', function () {
            assert.colorEqual(this.style.color, "#00ff00");
          });
        });
      });

      test("format misc", ()=>{
        TH.pointerDownUp('.rtToolbar [name=formatText].select', 'Normal text');

        assert.dom('.glassPane .rtFormatText', ()=>{
          assert.dom('li>[title="Normal [alt-ctrl-0]"]');
          assert.dom('li>[title="Heading 1 [alt-ctrl-1]"]');
          assert.dom('li>[title="Heading 2 [alt-ctrl-2]"]');
          TH.click('li>[title="Heading 6 [alt-ctrl-6]"]');
        });

        refute.dom('.glassPane');

        assert.dom('.rtToolbar [name=formatText]', 'Heading 6');
      });
    });

    test("more", ()=>{
      assert.dom('.rtToolbar:not(.more)', function () {
        TH.pointerDownUp("[name=more]");
        assert.className(this, 'more');
        TH.pointerDownUp("[name=more]");
        refute.className(this, 'more');
      });
    });
  });
});

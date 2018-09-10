isClient && define((require, exports, module)=>{
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const RichTextEditorTpl = require('koru/html!./rich-text-editor-test');
  const DomNav          = require('koru/ui/dom-nav');
  const util            = require('koru/util');
  const session         = require('../session/client-rpc');
  const KeyMap          = require('./key-map');
  const Modal           = require('./modal');
  const RichText        = require('./rich-text');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd, match: m} = TH;
  const htj = Dom.htmlToJson;

  const sut               = require('./rich-text-editor');

  const {ctrl} = KeyMap;

  let v ={};

  const focusin = (inputElm)=>{
    inputElm.focus();
    TH.trigger(inputElm, 'focusin');
    TH.trigger(document, 'selectionchange');
  };

  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{
    let tpl;
    before(()=>{
      tpl = Dom.newTemplate(RichTextEditorTpl);
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

    test("undo/redo", ()=>{
      document.body.appendChild(tpl.$autoRender({content: Dom.h('hello')}));

      const rte = Dom('.richTextEditor'), input = rte.firstChild;

      const ctx = Dom.ctx(rte), {undo} = ctx;

      undo.recordNow();
      undo.undo();

      const hello = input.firstChild;
      const ins = (elm)=>{input.insertBefore(elm, hello)};

      TH.setRange(hello, 0);
      focusin(input);

      ins(Dom.h({b: "11"}));
      undo.recordNow();

      ins(Dom.h({i: "22"}));
      undo.recordNow();
      assert.equals(htj(input).div, [{b: "11"}, {i: "22"}, 'hello']);

      TH.keydown(input, 'Z', {ctrlKey: true});
      TH.keydown(input, 'Z', {ctrlKey: true});
      assert.equals(htj(input).div, ['hello']);

      TH.keydown(input, 'Z', {ctrlKey: true, shiftKey: true});
      assert.equals(htj(input).div, [{b: "11"}, 'hello']);

      TH.keydown(input, 'Y', {ctrlKey: true});
      assert.equals(htj(input).div, [{b: "11"}, {i: "22"}, 'hello']);
    });

    test("get/set value", ()=>{
      document.body.appendChild(tpl.$autoRender({content: null}));

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

      document.body.appendChild(tpl.$autoRender({content: ''}));

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
      document.body.appendChild(tpl.$autoRender({content: ''}));

      const input = Dom('.input');

      TH.keydown(input, '0', {altKey: true, ctrlKey: true});
      assert.calledWith(v.ec, 'formatBlock', false, 'div');
    });

    group("pre", ()=>{
      let inputElm, undo;
      beforeEach(()=>{
        document.body.appendChild(tpl.$autoRender({content: ''}));
        inputElm = Dom('.input');
        undo = Dom.ctx(inputElm).undo;
        v.selectCode = ()=>{
          const node = inputElm.querySelector('pre').firstChild;
          const range = TH.setRange(node, 0);
          focusin(inputElm);
          return range;
        };
      });

      test("shift newline", ()=>{
        inputElm.appendChild(Dom.h({'data-lang': "Text", pre: ["one two"]}));
        const pre = inputElm.firstChild;
        TH.setRange(inputElm.firstChild.firstChild, 3);
        focusin(inputElm);

        TH.keydown(pre.firstChild, 13, {shiftKey: true});

        assert.equals(htj(pre).pre, ['one', {br: ''}, ' two']);
      });

      test("load languages", ()=>{
        const langs = stub(session, 'rpc').withArgs('RichTextEditor.fetchLanguages');
        assert.dom('.input', function () {
          this.appendChild(Dom.h({pre: ["one\ntwo"]}));
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

        const highlight = stub(session, 'rpc').withArgs('RichTextEditor.syntaxHighlight');

        assert.dom('.glassPane', function () {
          assert.dom('li', 'C');
          TH.click('li', 'Ruby');
        });

        assert.dom('pre[data-lang="ruby"]');

        assert.calledWith(highlight, 'RichTextEditor.syntaxHighlight', "ruby", "one\ntwo");
      });

      group("exit", ()=>{
        const preContent = {
          'data-lang': 'Rust',
          pre: [{span: 'one'}, {br: ''}, {span: 'two'}, {b: '2'}, {br: ''}, {span: 'three'}]};

        test("empty", ()=>{
          const pre = Dom.h({pre: [{br: ''}, '']});
          inputElm.appendChild(pre);
          TH.setRange(pre, 0);
          focusin(inputElm);

          undo.recordNow();
          TH.keydown(pre, 'À', {ctrlKey: true});

          assert.equals(htj(inputElm).div, {br: ''});
        });

        test("selection begining", ()=>{
          const pre = Dom.h(preContent);

          inputElm.appendChild(pre);
          TH.setRange(pre.firstChild, 0, pre.childNodes[2].firstChild, 2);
          focusin(inputElm);

          undo.recordNow();
          TH.keydown(pre, 'À', {ctrlKey: true});

          assert.equals(htj(inputElm).div, [
            {span: 'one'}, {br: ''}, {span: 'tw'},
            {"data-lang": 'Rust', pre: [{span: 'o'}, {b: '2'}, {br: ''}, {span: 'three'}]},
          ]);

          assert.rangeEquals(undefined, inputElm.childNodes[0].firstChild, 0,
                             inputElm.childNodes[2], 1);
        });

        test("selection middle", ()=>{
          const pre = Dom.h(preContent);

          inputElm.appendChild(pre);
          TH.setRange(pre.childNodes[2].firstChild, 2, pre.lastChild.firstChild, 3);
          focusin(inputElm);

          undo.recordNow();
          TH.keydown(pre, 'À', {ctrlKey: true});

          assert.equals(htj(inputElm).div, [
            {"data-lang": 'Rust', pre: [{span: 'one'}, {br: ''}, {span: 'tw'}]},
            {span: 'o'}, {b: '2'}, {br: ''}, {span: 'thr'},
            {"data-lang": 'Rust', pre: {span: 'ee'}},
          ]);

          assert.rangeEquals(undefined, inputElm.childNodes[1].firstChild, 0,
                             inputElm.childNodes[4], 1);
        });

        test("first line", ()=>{
          const pre = Dom.h(preContent);

          inputElm.appendChild(pre);
          TH.setRange(pre.firstChild, 1);
          focusin(inputElm);

          undo.recordNow();

          TH.keydown(pre, 'À', {ctrlKey: true});

          assert.equals(htj(inputElm).div, [
            {span: 'one'}, {br: ''},
            {"data-lang": 'Rust', pre: [
              {span: 'two'}, {b: '2'}, {br: ''}, {span: 'three'}]
            }]);

          undo.undo();
          assert.equals(htj(inputElm).div, preContent);
        });

        test("empty line", ()=>{
          const ctx = Dom.ctx(inputElm);
          const pre = Dom.h(preContent);
          const emptyLine = Dom.h({br: ''});
          pre.insertBefore(emptyLine, pre.childNodes[2]);
          inputElm.appendChild(pre);
          TH.setRange(pre, 2);
          focusin(inputElm);
          assert.same(ctx.mode.type, 'code');

          const begin = htj(inputElm);
          undo.recordNow();

          TH.keydown(pre, 'À', {ctrlKey: true});

          const ans = [
            {"data-lang": 'Rust', pre: [{span: 'one'}, {br: ''}]},
            {br: ''},
            {"data-lang": 'Rust', pre: [{span: 'two'}, {b: '2'}, {br: ''}, {span: 'three'}]},
          ];
          assert.equals(htj(inputElm).div, ans);

          assert.rangeEquals(undefined, inputElm, 1, inputElm, 1);

          undo.undo();
          assert.equals(htj(inputElm), begin);

          undo.redo();
          assert.equals(htj(inputElm).div, ans);
        });

        test("middle line", ()=>{
          const ctx = Dom.ctx(inputElm);
          const pre = Dom.h(preContent);
          inputElm.appendChild(pre);
          TH.setRange(pre.childNodes[2].firstChild, 2);
          focusin(inputElm);

          undo.recordNow();

          const cmStub = stub();
          onEnd(ctx.caretMoved.onChange(cmStub));

          assert.same(ctx.mode.type, 'code');

          undo.recordNow();

          TH.keydown(pre, 'À', {ctrlKey: true});

          assert.same(ctx.mode.type, 'standard');
          assert.calledWith(cmStub, undefined);

          assert.equals(htj(inputElm).div, [
            {"data-lang": 'Rust', pre: [{span: 'one'}, {br: ''}]},
            {span: 'two'}, {b: '2'}, {br: ''},
            {"data-lang": 'Rust', pre: {span: 'three'}}]);

          TH.keydown(pre, 'Z', {ctrlKey: true});
          assert.equals(htj(inputElm).div, preContent);

          assert.same(ctx.mode.type, 'code');
          assert.calledTwice(cmStub);
        });

        test("last line", ()=>{
          const pre = Dom.h(preContent);
          inputElm.appendChild(pre);

          TH.setRange(pre.lastChild.firstChild, 'three'.length);
          focusin(inputElm);

          undo.recordNow();

          TH.keydown(pre, 'À', {ctrlKey: true});

          assert.equals(htj(inputElm).div, [
            {"data-lang": 'Rust', pre: [
              {span: 'one'}, {br: ''}, {span: 'two'}, {b: '2'}, {br: ''}]},
            {span: 'three'}]);

          TH.keydown(pre, 'Z', {ctrlKey: true});
          assert.equals(htj(inputElm).div, preContent);
        });

        test("inner last line", ()=>{
          const pre = Dom.h(preContent);
          const br = Dom.h({br: ''});
          pre.lastChild.appendChild(br);
          inputElm.appendChild(pre);

          TH.setRange(br, 0);
          focusin(inputElm);

          undo.recordNow();

          TH.keydown(pre, 'À', {ctrlKey: true});

          assert.equals(htj(inputElm).div, [
            {"data-lang": 'Rust', pre: [
              {span: 'one'}, {br: ''}, {span: 'two'}, {b: '2'}, {br: ''}]},
            {span: ['three', {br: ''}]}]);
        });
      });

      test("syntax highlight", ()=>{
        const highlight = stub(session, 'rpc').withArgs('RichTextEditor.syntaxHighlight');
        assert.dom('.input', function () {
          this.focus();
          this.appendChild(Dom.h({pre: ["if a:\n  (b)\n"], '$data-lang': 'python'}));
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
        assert.dom('.input>pre', function () {
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
        assert.dom('.input>pre', function () {
          TH.keydown(this, 'H', {ctrlKey: true, shiftKey: true});
        });

        highlight.yield('error');

        assert.dom('pre>span.k', 'if');
        assert.calledWith(koru.globalCallback, 'error');
      });

      test("on selection", ()=>{
        assert.dom('.input', function () {
          this.focus();
          this.appendChild(Dom.h({ol: [{li: 'hello'}, {li: 'world'}]}));
          assert.dom('ol', function () {
            DomNav.selectNode(this);
          });
          TH.keyup(this, 39);
          TH.keydown(this, 'À', {ctrlKey: true});

          const pre = Dom('pre[data-lang="text"]');
          const range = Dom.getRange();
          assert.rangeEquals(range, pre, 0, pre, 3);
          range.collapse();
          Dom.setRange(range);
          sut.insert(' foo');
          assert.equals(htj(pre).pre, [
            'hello', {br: ''}, 'world foo'
          ]);
          TH.keydown(this, 13);
          TH.keyup(this, 13);
          assert.same(sut.$ctx(this).mode.type, 'code');
          DomNav.insertNode(Dom.h("bar"));
          assert.dom(RichText.fromToHtml(this.parentNode.value), function () {
            assert.dom('pre[data-lang="text"]', pre =>{
              assert.equals(htj(pre).pre, [
                'hello', {br: ''}, 'world foo', {br: ''}, 'bar', {br: ''}
              ]);
            });
          });
          this.insertBefore(Dom.h({div: "outside"}), this.firstChild);
          TH.setRange(this.firstChild.firstChild, 3);
          focusin(inputElm);
          TH.keydown(this, 13);
          assert.same(this.firstChild.firstChild.textContent, 'outside');
        });
      });

      test("selectionchange", ()=>{
        assert.dom('.input', function () {
          this.focus();
          assert.same(sut.$ctx(this).mode.type, 'standard');
          Dom('.richTextEditor').value = Dom.h([{div: "first"}, {pre: "second"}]);
          TH.setRange(this.lastChild, 0);
          focusin(this);
          assert.same(sut.$ctx(this).mode.type, 'code');
          TH.setRange(this.firstChild, 0);
          const saveCaret = spy(undo, 'saveCaret');
          TH.trigger(document, 'selectionchange');
          assert.calledWith(saveCaret, m.field('startContainer', this.firstChild));
          assert.same(sut.$ctx(this).mode.type, 'standard');
        });
      });

      test("on empty", ()=>{
        const input = Dom('.input');
        input.focus();
        TH.setRange(input);

        TH.keydown(input, KeyMap['`'], {ctrlKey: true});

        assert.equals(htj(input).div, {"data-lang": 'text', pre: {br: ''}});

        const pre = input.firstChild;
        sut.insert(' foo');

        if (pre.lastChild !== pre.firstChild)
          assert.equals(htj(pre).pre, [' foo', {br: ''}]);
        else
          assert.equals(htj(pre).pre, [' foo']);
        TH.keydown(input, 13);
        TH.keyup(input, 13);
        assert.equals(htj(pre).pre, [' foo', {br: ''}, {br: ''}]);
        DomNav.insertNode(Dom.h('bar'));
        assert.equals(htj(pre).pre, [' foo', {br: ''}, 'bar', {br: ''}]);
      });

      test("create empty", ()=>{
        const input = Dom('.input');
        input.appendChild(Dom.h(["1", {br: ''}, "2"]));

        input.focus();
        TH.setRange(input, 1);

        TH.keydown(input, KeyMap['`'], {ctrlKey: true});

        assert.equals(htj(input).div, [
          '1',
          {"data-lang": 'text', pre: {br: ''}},
          '2']);

        const range = Dom.getRange();
        const pre = Dom('pre');

        assert.same(range.startContainer, pre);
        assert.same(range.startOffset, 0);

        TH.keydown(input, 13);
        TH.keyup(input, 13);
        assert.equals(htj(pre).pre, [{br: ''}, {br: ''}]);
      });
    });

    test("fontSize", ()=>{
      document.body.appendChild(tpl.$autoRender({
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
      document.body.appendChild(tpl.$autoRender({
        content: Dom.h({font: {
          span: 'bold', $style: 'background-color:#ffff00'}, $color: '#0000ff'})}));

      const inputElm = Dom('.input');
      focusin(inputElm);

      assert.dom('.input font span', span =>{
        TH.setRange(span.firstChild, 0, span.firstChild, 1);

        TH.keydown(span, 'H', {ctrlKey: true, shiftKey: true});
        TH.trigger(span, 'focusout');
      });

      assert.className(Dom('.richTextEditor'), 'focus');


      // set hiliteColor

      assert.dom('#ColorPicker', ()=>{
        assert.dom('[name=hex]', {value: '0000ff'});
        assert.dom('.fontColor[data-mode="foreColor"]', elm =>{
          TH.click('[name=hiliteColor]');
          assert.same(elm.getAttribute('data-mode'), 'hiliteColor');
          TH.click('[name=foreColor]');
          assert.same(elm.getAttribute('data-mode'), 'foreColor');
          TH.click('[name=hiliteColor]');
        });
        assert.dom('[name=hex]', {value: 'ffff00'}, hex =>{
          TH.input(hex, 'ff0000');
        });
        TH.click('[name=apply]');
      });

      refute.dom('#ColorPicker');


      assert.dom('.input', input =>{
        document.activeElement.blur();
        TH.trigger(input, 'focusout');
        refute.className(Dom('.richTextEditor'), 'focus');

        assert.dom('*', 'b', elm =>{
          assert.colorEqual(elm.style.backgroundColor, '#ff0000');
        });
        sut.$ctx(input).mode.actions.fontColor({target: input});
      });

      // set foreColor

      assert.dom('#ColorPicker', ()=>{
        TH.input('[name=hex]', 'f0f0f0');
        TH.click('[name=apply]');
      });

      assert.dom('.input', input =>{
        if (Dom('span>span'))
          assert.dom('span>span>span', 'b', span =>{
            assert.colorEqual(span.style.backgroundColor, '#ff0000');
            assert.colorEqual(span.parentNode.style.color, '#f0f0f0');
          });
        else assert.dom('span', 'b', span =>{
          assert.colorEqual(span.style.color, '#f0f0f0');
          assert.colorEqual(span.style.backgroundColor, '#ff0000');
        });
        sut.$ctx(input).mode.actions.fontColor({target: input});
      });

      // clear background

      assert.dom('#ColorPicker', ()=>{
        TH.click('[name=removeHilite]');
      });

      refute.dom('#ColorPicker');

      assert.dom('.input', ()=>{
        if (Dom('span>span'))
          assert.dom('span>span>span', 'b', span =>{
            assert.same(window.getComputedStyle(span).backgroundColor, 'rgba(0, 0, 0, 0)');
          });
        else assert.dom('*', 'b', elm =>{
          assert.colorEqual(window.getComputedStyle(elm).backgroundColor, 'rgba(0,0,0,0)');
        });
      });
    });

    test("inline code on selection", ()=>{
      document.body.appendChild(tpl.$autoRender({content: RichText.toHtml("1\n2")}));
      const inputElm = Dom('.input'), ctx = Dom.ctx(inputElm);

      document.execCommand('styleWithCSS', false, true);
      TH.setRange(inputElm.lastChild.firstChild, 0, inputElm.lastChild.firstChild, 1);
      focusin(inputElm);
      TH.keydown(inputElm, 'À', {ctrlKey: true});

      assert.equals(htj(inputElm).div, [
        {div: '1'}, {div: {style: 'font-family: monospace;', span: '2'}}
      ]);

      sut.insert('foo');

      assert.equals(htj(inputElm).div[1], {
        div: {style: 'font-family: monospace;', span: 'foo'}});

      TH.keydown(inputElm, 'À', {ctrlKey: true});
      assert.equals(ctx.override, {font: 'sans-serif'});
      sut.insert(' bar');
      TH.trigger(inputElm, 'selectionchange');
      assert.same(ctx.override, undefined);


      assert.equals(htj(inputElm).div[1], {
        div: [{style: 'font-family: monospace;', span: 'foo'}, ' bar']});

      TH.setRange(inputElm.querySelector('span').firstChild, 1);

      TH.keydown(inputElm, 'À', {ctrlKey: true});
      sut.insert('baz');
      TH.trigger(inputElm, 'selectionchange');

      assert.equals(htj(inputElm).div, [
        {div: '1'}, {div: [
          {style: 'font-family: monospace;', span: 'f'},
          'baz',
          {style: 'font-family: monospace;', span: 'oo'},
          ' bar'
        ]}]);


      TH.setRange(Dom('span').firstChild, 1, Dom('span~span').firstChild, 1);
      TH.keydown(inputElm, 'À', {ctrlKey: true});

      assert.equals(htj(inputElm).div, [{div: '1'}, {div: [
        {style: 'font-family: monospace;', span: 'f'}, 'baz', 'o',
        {style: 'font-family: monospace;', span: 'o'}, ' bar']}]);

      const range = Dom.getRange();
      if (util.engine.startsWith('Firefox') && range.startContainer.nodeValue === 'f') {
        range.setStart(Dom('span').nextSibling, 0);
        Dom.setRange(range);
      }
      TH.keydown(inputElm, 'À', {ctrlKey: true});

      assert.equals(htj(inputElm).div, [{div: '1'}, {div: [
        {style: 'font-family: monospace;', span: ['f', 'baz', 'o', 'o']},
        ' bar']}]);
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
      document.body.appendChild(tpl.$autoRender({content: Dom.h('hello')}));

      assert.dom('.input', input =>{
        TH.setRange(input.firstChild, 0);
        focusin(input);

        const ec = spy(document, 'execCommand');

        TH.keydown(input, '7', {ctrlKey: true, shiftKey: true});
        assert.calledOnceWith(ec, 'insertOrderedList');

        TH.keydown(input, '8', {ctrlKey: true, shiftKey: true});
        assert.calledWith(ec, 'insertUnorderedList');

        TH.keydown(input, 13, {shiftKey: true});
        DomNav.clearTrailingBR(Dom('li'));

        assert.equals(htj(input).div, {ul: {li: ['', {br: ''}, 'hello']}});
      });
    });

    test("textAlign", ()=>{
      v.ec = stub(document, 'execCommand');

      document.body.appendChild(tpl.$autoRender({content: ''}));

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
      document.body.appendChild(tpl.$autoRender({content: Dom.h({b: 'foo'})}));

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

      document.body.appendChild(tpl.$autoRender({content: ''}));

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

        document.body.appendChild(tpl.$autoRender({content: ''}));
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
        v.input.parentNode.value = Dom.h({pre: 'paste before'});
        assert.dom('.input', input =>{
          assert.dom('pre', pre =>{
            TH.setRange(pre.firstChild, 6);
            focusin(input);
            v.paste(v.event);
            assert.equals(htj(pre).pre, ['paste ', 'bold world', 'before']);
            sut.$ctx(input).mode.paste('<b>bold</b>\nplain<br>newline');
            assert.equals(htj(pre).pre, [
              'paste ', 'bold world', '',
              'bold', {br: ''}, 'plain', {br: ''}, 'newline',
              'before']);
          });
        });
      });
    });

    test("empty", ()=>{
      document.body.appendChild(tpl.$autoRender({content: RichText.toHtml('hello\nworld')}));
      Dom.flushNextFrame();

      assert.dom('.input[contenteditable=true]', function () {
        Dom.removeChildren(this);
        this.appendChild(Dom.h({br: null}));
        TH.trigger(this, 'input');
        assert.same(this.firstChild, null);
      });
    });

    test("blockquote", ()=>{
      document.body.appendChild(tpl.$autoRender({content: RichText.toHtml('hello\nworld')}));

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
        document.body.appendChild(tpl.$autoRender({
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

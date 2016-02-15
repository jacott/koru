isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./rich-text-editor');
  var Dom = require('koru/dom');
  var RichTextEditorTpl = require('koru/html!./rich-text-editor-test');
  var util = require('koru/util');
  var RichText = require('./rich-text');
  var KeyMap = require('./key-map');
  var Modal = require('./modal');
  var session = require('../session/client-rpc');
  var koru = require('koru');

  var ctrl = KeyMap.ctrl;

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.tpl = Dom.newTemplate(util.deepCopy(RichTextEditorTpl));
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "test attrs helper": function () {
      var elm = sut.$autoRender({
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
    },

    "test get/set value": function () {
      document.body.appendChild(v.tpl.$autoRender({content: null}));

      assert.dom('.input', function () {
        assert.same(this.firstChild, null);
        this.parentNode.value = Dom.h({b: 'bold'});
        assert.same(this.firstChild.textContent, 'bold');
        this.parentNode.value = null;
        assert.same(this.firstChild, null);
      });
    },

    "test forward/back char": function () {
      runSubTests({
        "within text node ": function () {
          this.appendChild(RichText.toHtml("hello world"));
          TH.setRange(sut.firstInnerMostNode(this),5);

          Dom.setRange(sut.select(this, 'char', 1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 5, sut.firstInnerMostNode(this), 6);

          collapse();
          Dom.setRange(sut.select(this, 'char', -1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 5, sut.firstInnerMostNode(this), 6);
        },

        "next line": function () {
          this.innerHTML = '<div><div>hello</div><div>world</div></div>';
          TH.setRange(sut.firstInnerMostNode(this),5);

          Dom.setRange(sut.select(this, 'char', 1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 5, sut.firstInnerMostNode(this.firstChild.lastChild), 0);

          collapse();
          Dom.setRange(sut.select(this, 'char', -1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 5, sut.firstInnerMostNode(this.firstChild.lastChild), 0);
        },

        "block nested": function () {
          this.innerHTML = "<div><div>hello world <b>in <i>here</i></b></div></div><div>line 2</div>";
          var iElm = this.querySelector('i').firstChild;
          TH.setRange(iElm, 4);

          Dom.setRange(sut.select(this, 'char', 1));
          assert.rangeEquals(iElm, 4, this.childNodes[1].firstChild, 0);

          collapse();
          Dom.setRange(sut.select(this, 'char', -1));
          assert.rangeEquals(iElm, 4, this.childNodes[1].firstChild, 0);
        },

        "span nested": function () {
          this.innerHTML = "<div><div>hello <b>in <i>here</i> out</b></div></div><div>line 2</div>";
          TH.setRange(sut.firstInnerMostNode(this), 6);

          Dom.setRange(sut.select(this, 'char', 1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 6, sut.firstInnerMostNode(this.querySelector('b')), 1);

          collapse();
          Dom.setRange(sut.select(this, 'char', 7));
          assert.rangeEquals(sut.firstInnerMostNode(this.querySelector('b')), 1, sut.lastInnerMostNode(this.querySelector('b')), 1);

          collapse();
          Dom.setRange(sut.select(this, 'char', -7));
          assert.rangeEquals(sut.firstInnerMostNode(this.querySelector('b')), 1, sut.lastInnerMostNode(this.querySelector('b')), 1);

          collapse(true);
          Dom.setRange(sut.select(this, 'char', -1));
          assert.rangeEquals(sut.firstInnerMostNode(this.querySelector('b')), 0, sut.firstInnerMostNode(this.querySelector('b')), 1);

          collapse(true);
          Dom.setRange(sut.select(this, 'char', -1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 5, sut.firstInnerMostNode(this.querySelector('b')), 0);
        },
      });
    },

    "test focus": function () {
      document.body.appendChild(v.tpl.$autoRender({content: ''}));

      assert.dom('.input', function () {
        this.focus();
        TH.trigger(this, 'focusin');
        assert.className(this.parentNode, 'focus');
        TH.keydown(this, 'O', {ctrlKey: true, shiftKey: true});
        TH.trigger(this, 'focusout');
        assert.className(this.parentNode, 'focus');
        Dom.remove(Dom('.glassPane'));
        TH.trigger(this, 'focusout');
        refute.className(this.parentNode, 'focus');
      });
    },

    "test bold, italic, underline": function () {
      v.ec = test.stub(document, 'execCommand');

      document.body.appendChild(v.tpl.$autoRender({content: ''}));

      assert.dom('.input', function () {
        TH.keydown(this, 'B', {ctrlKey: true});
        TH.keydown(this, 'B', {ctrlKey: false});
        assert.calledOnceWith(v.ec, 'bold');

        TH.keydown(this, 'I', {ctrlKey: true});
        assert.calledWith(v.ec, 'italic');

        TH.keydown(this, 'U', {ctrlKey: true});
        assert.calledWith(v.ec, 'underline');
      });
    },

    "pre": {
      setUp: function () {
        document.body.appendChild(v.tpl.$autoRender({content: ''}));
        v.selectCode = function () {
          var node = Dom('.input pre>div').firstChild;
          var range = TH.setRange(node, 2);
          TH.keyup(node, 39);
          return range;
        };
      },

      "test load languages": function () {
        var langs = test.stub(session, 'rpc').withArgs('RichTextEditor.fetchLanguages');
        assert.dom('.input', function () {
          this.appendChild(Dom.h({pre: {div: "one\ntwo"}}));
          sut.languageList = null;
          var elm = v.selectCode().startContainer;
          test.onEnd(sut.$ctx(this).caretMoved.onChange(v.caretMoved = test.stub()).stop);
        });

        assert.called(langs);
        refute.called(v.caretMoved);
        langs.yield(null, [['c', 'C'], ['ruby', 'Ruby']]);
        assert.called(v.caretMoved);
        assert.equals(sut.languageList, [['c', 'C'], ['ruby', 'Ruby']]);
        assert.equals(sut.languageMap, {c: 'C', ruby: 'Ruby'});

      },

      "test set language": function () {
        assert.dom('.input', function () {
          this.focus();
          this.appendChild(Dom.h({pre: {div: "one\ntwo"}}));
          sut.languageList = [['c', 'C'], ['ruby', 'Ruby']];
          var elm = v.selectCode().startContainer;
          TH.keydown(elm, 'L', {ctrlKey: true});
          test.onEnd(sut.$ctx(this).caretMoved.onChange(v.caretMoved = test.stub()).stop);
        });

        assert.dom('.glassPane', function () {
          assert.dom('li', 'C');
          TH.click('li', 'Ruby');
        });

        assert.dom('pre[data-lang="ruby"]');
      },

      "test syntax highlight": function () {
        var highlight = test.stub(session, 'rpc').withArgs('RichTextEditor.syntaxHighlight');
        assert.dom('.input', function () {
          this.focus();
          this.appendChild(Dom.h({pre: {div: "if a:\n  (b)\n"}, '$data-lang': 'python'}));
          var elm = v.selectCode().startContainer;
          this.appendChild(Dom.h({div: "after"}));
          assert.dom('pre+div', 'after');
          TH.keydown(elm, 'H', {ctrlKey: true, shiftKey: true});
          test.onEnd(sut.$ctx(this).caretMoved.onChange(v.caretMoved = test.stub()).stop);
        });

        assert.calledWith(highlight, 'RichTextEditor.syntaxHighlight', "python", "if a:\n  (b)\n");
        assert.dom('.richTextEditor.syntaxHighlighting');

        highlight.yield(null, [8, 0, 3, 3, 1, 0, 2]);

        assert.dom('pre', function () {
          var rt = RichText.fromHtml(this, {includeTop: true});
          assert.equals(rt[0], ['code:python', 'if a:', '  (b)', '']);
          assert.equals(rt[1], [8, 0, 3, 3, 1, 0, 2]);
        });
        assert.dom('pre+div', 'after');
        assert.called(v.caretMoved);

        highlight.reset();
        assert.dom('.input>pre>div', function () {
          TH.keydown(this, 'H', {ctrlKey: true, shiftKey: true});
        });
        assert.calledWith(highlight, 'RichTextEditor.syntaxHighlight', "python", "if a:\n  (b)\n");
        highlight.yield(null, [8, 0, 3, 3, 1, 0, 2]);
        assert.dom('pre', function () {
          var rt = RichText.fromHtml(this, {includeTop: true});
          assert.equals(rt[0], ['code:python', 'if a:', '  (b)', '']);
          assert.equals(rt[1], [8, 0, 3, 3, 1, 0, 2]);
        });


        highlight.reset();
        test.stub(koru, 'globalCallback');
        assert.dom('.input>pre>div', function () {
          TH.keydown(this, 'H', {ctrlKey: true, shiftKey: true});
        });

        highlight.yield('error');

        assert.dom('pre div>span.k', 'if');
        assert.calledWith(koru.globalCallback, 'error');
      },

      "test on selection": function () {
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
      },

      "test mouseup on/off": function () {
         assert.dom('.input', function () {
           this.focus();
           assert.same(sut.$ctx(this).mode.type, 'standard');
           Dom('.richTextEditor').value = Dom.h([{div: "first"}, {pre: "second"}]);
           TH.setRange(this.lastChild, 0);
           TH.mouseDownUp(this);
           assert.same(sut.$ctx(this).mode.type, 'code');
           TH.setRange(this.firstChild, 0);
           TH.mouseDownUp(this);
           assert.same(sut.$ctx(this).mode.type, 'standard');
         });
      },

      "test on empty": function () {
        assert.dom('.input', function () {
          this.focus();
          TH.setRange(this);

          TH.keydown(this, '`', {ctrlKey: true});

          assert.dom('pre[data-lang="text"]>div>br');
          sut.insert(' foo');
          assert.dom('pre[data-lang="text"]', 'foo');
        });
      },
    },

    "test fontSize": function () {
      document.body.appendChild(v.tpl.$autoRender({content: Dom.h({font: 'bold', $size: "1"})}));

      assert.dom('.input font', function () {
        TH.setRange(this.firstChild, 0, this.firstChild, 1);

        sut.$ctx(this).mode.actions.fontSize({target: this.firstChild});
      });

      assert.dom('.glassPane', function () {
          assert.dom('li>font[size="6"]', 'XX large');
          TH.click('li>font[size="2"]', 'Small');
      });

      assert.dom('font[size="2"]', 'b');
    },

    "test fontColor": function () {
      document.body.appendChild(v.tpl.$autoRender({content: Dom.h({font: {span: 'bold', $style: 'background-color:#ffff00'}, $color: '#0000ff'})}));

      assert.dom('.input font span', function () {
        this.focus();
        TH.trigger(this, 'focusin');
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
        assert.dom('font[color="#f0f0f0"]', 'b');
        sut.$ctx(this).mode.actions.fontColor({target: this});
      });

      // clear background

      assert.dom('#ColorPicker', function () {
        TH.click('[name=removeHilite]');
      });

      refute.dom('#ColorPicker');

       assert.dom('.input', function () {
        assert.dom('*', 'b', function () {
          assert.colorEqual(window.getComputedStyle(this).backgroundColor, 'rgba(0,0,0,0)');
        });
      });
    },

    "test inline code on selection": function () {
      document.body.appendChild(v.tpl.$autoRender({content: RichText.toHtml("1\n2")}));

      assert.dom('.input', function () {
        this.contentEditable = true;
        this.focus();
        TH.setRange(this.lastChild.firstChild, 0, this.lastChild.firstChild, 1);
        TH.keydown(this, '`', {ctrlKey: true});
        assert.dom('font[face=monospace]', '2');
        sut.insert('foo');
        assert.dom('font[face=monospace]', 'foo');

        TH.keydown(this, '`', {ctrlKey: true});
        sut.insert(' bar');
        if (Dom('font[face=monospace] font[face=initial]')) {
          assert.dom('font[face=monospace]', 'foo bar', function () {
            assert.dom('font[face=initial]', 'bar');
          });
        } else {
          assert.dom('font[face=monospace]', 'foo', function () {
            assert.same(this.nextSibling.textContent, ' bar');
          });
        }
        assert.dom('font[face=monospace]', function () {
          TH.setRange(this.firstChild, 1);
        });
        TH.keydown(this, '`', {ctrlKey: true});
        sut.insert('baz');
        assert.dom('font[face=monospace]', /^f/, function () {
          v.start = this.firstChild;
        });
        assert.dom('font[face=initial]', 'baz');

        if (Dom('font[face=initial]+font[face=monospace]')) {
          assert.dom('font[face=initial]+font[face=monospace]', 'oo', function () {
            TH.setRange(v.start, 0, this.firstChild, 1);
          });
          TH.keydown(this, '`', {ctrlKey: true});
          assert.dom('font[face=monospace]', 'o');
        } else {
          assert.dom('font[face=initial]', 'baz', function () {
            TH.setRange(v.start, 0, this.nextSibling, 1);
          });
          TH.keydown(this, '`', {ctrlKey: true});
          assert.dom('font[face=initial]', 'fbazo');
        }
        var rt = RichText.fromHtml(this);
        rt.push(Dom.h({p: ''}));
        assert.dom(RichText.toHtml.apply(RichText, rt), function () {
          assert.dom('font', 'bar');
        });
      });
    },

    "test title": function () {
      var keyMap = test.stub(sut.modes.standard.keyMap, 'getTitle');
      sut.title('foo', 'insertOrderedList', 'standard');
      assert.calledWith(keyMap, 'foo', 'insertOrderedList');

      keyMap = test.stub(sut.modes.code.keyMap, 'getTitle');
      sut.title('foo', 'bar', 'code');
      assert.calledWith(keyMap, 'foo', 'bar');
    },

    "test lists": function () {
      v.ec = test.stub(document, 'execCommand');

      document.body.appendChild(v.tpl.$autoRender({content: ''}));

      assert.dom('.input', function () {
        TH.keydown(this, '7', {ctrlKey: true, shiftKey: true});
        assert.calledOnceWith(v.ec, 'insertOrderedList');

        TH.keydown(this, '8', {ctrlKey: true, shiftKey: true});
        assert.calledWith(v.ec, 'insertUnorderedList');
      });
    },

    "test textAlign": function () {
      v.ec = test.stub(document, 'execCommand');

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
    },

    "test removeFormat": function () {
      document.body.appendChild(v.tpl.$autoRender({content: Dom.h({b: 'foo'})}));

      assert.dom('.input', function () {
        assert.dom('b', function () {
          TH.setRange(this.firstChild, 0, this.firstChild, 3);
        });

        TH.keydown(this, 'Ü', {ctrlKey: true});

        refute.dom('b');
      });
    },

    "test indent, outdent": function () {
      v.ec = test.stub(document, 'execCommand');
      var keyMap = test.spy(sut.modes.standard.keyMap, 'exec');

      document.body.appendChild(v.tpl.$autoRender({content: ''}));

      assert.dom('.input', function () {
        TH.keydown(this, ']', {ctrlKey: true});
        assert.calledOnceWith(v.ec, 'indent');

        TH.keydown(this, '[', {ctrlKey: true});
        assert.calledWith(v.ec, 'outdent');

        v.ec.reset();

        TH.keydown(this, 'Ý', {ctrlKey: true});
        assert.calledWith(v.ec, 'indent');

        TH.keydown(this, 'Û', {ctrlKey: true});
        assert.calledWith(v.ec, 'outdent');
      });

      assert.calledWith(keyMap, TH.match.any, 'ignoreFocus');
    },

    "paste": {
      setUp: function () {
        v.ec = test.stub(document, 'execCommand');
        v.event = {
          clipboardData: {
            types: ['text/plain', 'text/html'],
            getData: test.stub().withArgs('text/html').returns('<b>bold</b> world'),
          },
        };

        document.body.appendChild(v.tpl.$autoRender({content: ''}));
        v.input = Dom('.input');
        var topCtx = Dom.getMyCtx(v.input.parentNode);

        v.slot = TH.findDomEvent(sut, 'paste')[0];
        v.origPaste = v.slot[2];
        v.paste = function (event) {
          var origCtx = Dom.current.ctx;
          Dom.current._ctx = topCtx;
          try {
            return v.origPaste.call(v.input.parentNode, event);
          } finally {
          Dom.current._ctx = origCtx;
          }
        };
        test.stub(Dom, 'stopEvent');


        v.insertHTML = v.ec.withArgs('insertHTML');
        v.insertText = v.ec.withArgs('insertText').returns(true);
      },

      tearDown: function () {
      },

      "test wiried": function () {
        assert.equals(v.slot, ['paste', '', v.origPaste]);
      },

      "test no clipboard": function () {
        delete v.event.clipboardData;

        v.paste(v.event);

        refute.called(Dom.stopEvent);
      },

      "test no insertHTML": function () {
        v.insertHTML.returns(false);

        v.paste(v.event);

        assert.calledWith(v.insertText, 'insertText', false, 'bold world');
        assert.called(Dom.stopEvent);
      },

      "test insertHTML": function () {
        v.insertHTML.returns(true);

        v.paste(v.event);
        assert.called(Dom.stopEvent);

        refute.called(v.insertText);
        assert.calledWith(v.insertHTML, 'insertHTML', false, '<div><b>bold</b> world</div>');
      },

      "test pre": function () {
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
      },
    },

    "test empty": function () {
      document.body.appendChild(v.tpl.$autoRender({content: RichText.toHtml('hello\nworld')}));
      Dom.flushNextFrame();

      assert.dom('.input[contenteditable=true]', function () {
        Dom.removeChildren(this);
        this.appendChild(Dom.h({br: null}));
        TH.trigger(this, 'input');
        assert.same(this.firstChild, null);
      });
    },

    "test blockquote": function () {
      document.body.appendChild(v.tpl.$autoRender({content: RichText.toHtml('hello\nworld')}));

      Dom.flushNextFrame();

      assert.dom('.input[contenteditable=true]', function () {
        this.focus();
        TH.setRange(this.firstChild.firstChild, 0);
        TH.keydown(this, ']', {ctrlKey: true});
        assert.dom('blockquote', 'hello', function () {
          assert.same(this.getAttribute('style'), null);
        });
      });
    },

    "links": {
      setUp: function () {
        document.body.appendChild(v.tpl.$autoRender({content: Dom.h([{b: "Hello"}, " ", {a: "world", $href: "/#/two"}])}));

        Dom.flushNextFrame();
      },

      "test changing a link": function () {
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
      },

      "test adding link with selection": function () {
        assert.dom('b', 'Hello', function () {
          TH.setRange(this.firstChild, 0, this.firstChild, 4);
          v.pos = Dom.getRange().getBoundingClientRect();
        });

        TH.keydown('.input', "K", {ctrlKey: true});

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
      },

      "test adding link no selection": function () {
        assert.dom('b', 'Hello', function () {
          TH.setRange(this.firstChild, 2);
        });

        TH.keydown('.input', "K", {ctrlKey: true});

        assert.dom('.rtLink', function () {
          TH.input('[name=text]', {value: ''}, 'foo');
          TH.input('[name=link]', {value: ''}, 'bar');
          TH.trigger(this, 'submit');
        });

        assert.dom('.input a[href="bar"]', 'foo', function () {
          assert.same(this.previousSibling.textContent, 'He');
          assert.same(this.nextSibling.textContent, 'llo');
        });
      },

      "test adding link no caret": function () {
        window.getSelection().removeAllRanges();

        TH.keydown('.input', "K", {ctrlKey: true});

        refute.dom('.rtLink');
      },

      "test canceling link": function () {
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

        TH.mouseDownUp('.glassPane');

        refute.dom('.glassPane');

        assert.dom('.richTextEditor>.input', function () {
          assert.same(this.outerHTML, v.orig);
          assert.same(document.activeElement, this);
        });
      },

    },
  });

  function collapse(start) {
    var range = Dom.getRange();
    range.collapse(start);
    Dom.setRange(range);
    return range;
  }

  function runSubTests(subTests) {
    document.body.appendChild(v.tpl.$autoRender({}));

    assert.dom('.richTextEditor .input[contenteditable=true]', function () {
      for(var name in subTests) {
        Dom.removeChildren(this);
        subTests[name].call(this);
      }
    });
  }
});

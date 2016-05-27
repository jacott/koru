isClient && define(function (require, exports, module) {
  var test, v;
  var koru = require('koru');
  var TH = require('./test-helper');
  var Dom = require('koru/dom');
  var util = require('koru/util');
  var sut = require('./rich-text-editor-toolbar');
  var RichTextEditor = require('./rich-text-editor');
  var Modal = require('./modal');
  var RichText = require('./rich-text');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.editor = sut.$autoRender({content: Dom.h([
        {b: "Hello"}, ' ', {i: "world"}, ' ', {a: "the link", $href: "/link.html"}
      ]), options: {id: "Foo"}, extend: {
        mentions: {'@': {
          title: 'Mention someone',
          buttonClass: 'myButton',
          list: function () {}
        }}}});

      v.origText = v.editor.value;
      document.body.appendChild(v.editor);

    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "with code": {
      setUp: function () {
        assert.dom('.input', function () {
          this.focus();
          this.appendChild(Dom.h({pre: {div: "one\ntwo"}}));
          var input = this;
          v.selectCode = function () {
            var node = input.querySelector('pre>div').firstChild;
            TH.setRange(node, 2);
            TH.keyup(node, 39);
          };
        });
      },

      "test data-mode": function () {
        assert.dom('.rtToolbar[data-mode=standard]');
        v.selectCode();
        assert.dom('.rtToolbar[data-mode=code]');
      },

      "test set language": function () {
        RichTextEditor.languageList = [['c', 'C'], ['lisp', 'Common Lisp, elisp']];

        v.selectCode();

        assert.dom('[name=language]', 'Text', function () {
          TH.mouseDownUp(this);
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
      },

      "test syntax highlight": function () {
        v.selectCode();

        var syntaxHighlight = test.stub(RichTextEditor.$ctx(Dom('.richTextEditor')).mode.actions, 'syntaxHighlight');
        assert.dom('[name=syntaxHighlight]', '', function () {
          TH.mouseDownUp(this);
        });

        assert.called(syntaxHighlight);
      },
    },

    "test rendering": function () {
      assert.dom('#Foo.richTextEditor', function () {
        assert.dom('>.rtToolbar:first-child>div', function () {
          assert.dom('button[name=bold]', 'B', function () {v.bold = this});
          assert.dom('button[name=italic]', 'I', function () {v.italic = this});
          assert.dom('button[name=underline]', 'U');
          assert.dom('button[name=link]', '', function () {v.link = this});
          assert.dom('button[name=code]', '');

          assert.dom('button[name=removeFormat]', function () {
            // I think the backslash upsets assert.dom
            assert.same(this.getAttribute('title'), 'Clear formatting [ctrl-\\]');
          });

          assert.dom('button[name=outdent][title="Decrease indent [ctrl-[]"]');
          assert.dom('button[name=indent][title="Increase indent [ctrl-]]"]');
          assert.dom('button[name=insertOrderedList][title="Numbered list [ctrl-shift-7]"]');
          assert.dom('button[name=insertUnorderedList][title="Bulleted list [ctrl-shift-8]"]');
        });

        // check toolbar state after cusor moved
        assert.dom('>.rtToolbar+.input', function () {
          assert.dom('b', 'Hello', function () {
            TH.setRange(this, 0);
            Dom.getCtx(this).updateAllTags();
            TH.mouseDownUp(this);
            assert.className(v.bold, 'on');
            refute.className(v.italic, 'on');
          });
          assert.dom('i', 'world', function () {
            TH.setRange(this, 1);
            Dom.getCtx(this).updateAllTags();
            refute.className(v.italic, 'on');
            TH.trigger(this, 'keyup');
            refute.className(v.bold, 'on');
            assert.className(v.italic, 'on');
          });
          assert.dom('a', 'the link', function () {
            TH.setRange(this, 1);
            Dom.getCtx(this).updateAllTags();
            refute.className(v.link, 'on');
            v.lnbb = v.link.getBoundingClientRect();

            TH.trigger(this, 'keyup');
            refute.className(v.italic, 'on');
            assert.className(v.link, 'on');
          });

        });

        refute.dom('.rtLink');
        TH.mouseDownUp(v.link);

        TH.stubAfTimeout();
      });

      assert.dom('.rtLink', function () {
        assert.dom('.startTab:first-child');
        assert.dom('.endTab:last-child');
        assert(Modal.topModal.handleTab);
        assert.dom('input', {value: '/link.html'}, function () {
        });
        TH.mouseDownUp(this.parentNode);
      });

      refute.dom('.rtLink');

      assert.dom('i', 'world', function () {
        TH.setRange(this.firstChild, 3);
        this.parentNode.focus();
        TH.trigger(this, 'mousedown');
        TH.trigger(this, 'mouseup');
        assert.className(v.italic, 'on');
        refute.className(v.link, 'on');
      });
    },

    "test changeing href": function () {
      assert.dom('a', 'the link', function () {
        TH.setRange(this.firstChild, 1);
        TH.trigger(this, 'keyup');
      });

      TH.mouseDownUp('[name=link]');

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
    },

    "test un/making bold": function () {
      assert.dom('.richTextEditor>.input', function () {
        this.focus();
        assert.dom('b', 'Hello', function () {
          Dom.selectElm(this);
          TH.trigger(this, 'keyup');
        });
      });

      TH.trigger('[name=bold]', 'mouseup');

      assert.dom('.richTextEditor>.input', function () {
        assert.msg('"Hello" should stil be bold if no mousedown').dom('b', "Hello");
      });

      TH.trigger('[name=bold]', 'mousedown');
      TH.trigger('[name=bold]', 'mouseup');

      assert.dom('.richTextEditor>.input', function () {
        assert.same(this.innerHTML, 'Hello <i>world</i> <a href=\"/link.html\">the link</a>');
      });
    },

    "test un/making code": function () {
      assert.dom('.richTextEditor>.input', function () {
        this.focus();
        assert.dom('b', 'Hello', function () {
          TH.setRange(this.firstChild, 1, this.firstChild, 3);
        });
        document.execCommand('styleWithCSS', false, true);
      });

      TH.mouseDownUp('[name=code]');

      assert.dom('.richTextEditor>.input b', function () {
        assert.same(this.innerHTML, 'H<span style=\"font-family: monospace;\">el</span>lo');
      });

      assert.dom('[name=code].on');
      TH.mouseDownUp('[name=code]');
      assert.dom('[name=code]:not(.on)');
    },

    "test mention button": function () {
      assert.dom('b', 'Hello', function () {
        TH.setRange(this.firstChild, 0);
        TH.trigger(this, 'keyup');
      });

      TH.mouseDownUp('button.myButton');

      assert.dom('.rtMention', function () {
        assert.dom('input', {value: ''});
        TH.trigger(this, 'focusout');
      });

      assert.dom('b', 'Hello', function () {
        TH.setRange(this.firstChild, 0, this.firstChild, 5);
        TH.trigger(this, 'keyup');
      });

      TH.mouseDownUp('button.myButton[title="Mention someone"]');

      assert.dom('.rtMention:not(.inline)', function () {
        assert.dom('input', {value: 'Hello'});
      });
    },

    "font attributes": {
      setUp: function () {
        assert.dom('b', 'Hello', function () {
          this.focus();
          TH.setRange(this.firstChild, 0, this.firstChild, 3);
          TH.trigger(this, 'keyup');
          document.execCommand('styleWithCSS', false, true);
        });
      },


      "test set fontName": function () {
        RichText.mapFontNames({poster: 'foo font'});
        TH.mouseDownUp('.rtToolbar [name=fontName]');

        assert.dom('.glassPane', function () {
          assert.dom('li>font[face="whiteboard"]', 'Whiteboard');
          TH.click('li>font[face="poster"],li>font[face="foo font"]', 'Poster');
        });

        assert.dom('.input', function () {
          assert.dom('b span', 'Hel', function () {
            assert.match(this.style.fontFamily, /^["']?foo font["']?$/);
          });
        });

        assert.dom('[name=fontName]', 'Poster');

        TH.mouseDownUp('.rtToolbar [name=fontName]');

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

        TH.mouseDownUp('.rtToolbar [name=fontName]');

        assert.dom('.glassPane', function () {
          TH.click('li>font[face="sans-serif"]', 'Sans serif');
        });

        assert.dom('[name=fontName]', 'Sans serif');
      },

      "test set fontSize": function () {
        TH.mouseDownUp('.rtToolbar [name=fontSize]');

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
      },

      "test set textAlign": function () {
        TH.mouseDownUp('.rtToolbar [name=textAlign]');

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
      },

      "test set fontColor": function () {
        TH.mouseDownUp('.rtToolbar [name=fontColor]');

        assert.dom('#ColorPicker', function () {
          TH.input('[name=hex]', '00ff00');
          TH.click('[name=apply]');
        });

        assert.dom('.input', function () {
          assert.dom('b span', 'Hel', function () {
            assert.colorEqual(this.style.color, "#00ff00");
          });
        });
      },
    },

    "test more": function () {
      assert.dom('.rtToolbar:not(.more)', function () {
        TH.mouseDownUp("[name=more]");
        assert.className(this, 'more');
        TH.mouseDownUp("[name=more]");
        refute.className(this, 'more');
      });
    },
  });
});

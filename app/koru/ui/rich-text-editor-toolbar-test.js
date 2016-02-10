isClient && define(function (require, exports, module) {
  var test, v;
  var koru = require('koru');
  var TH = require('./test-helper');
  var Dom = require('koru/dom');
  var util = require('koru/util');
  var sut = require('./rich-text-editor-toolbar');
  var RichTextEditor = require('./rich-text-editor');
  var Modal = require('./modal');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.editor = sut.$autoRender({content: Dom.h([
        {b: "Hello"}, ' ', {i: "world"}, ' ', {a: "the link", $href: "/link.html"}
      ]), options: {id: "Foo"}, extend: {
        mentions: {'@': {
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
      });

      TH.mouseDownUp('[name=code]');

      assert.dom('.richTextEditor>.input b', function () {
        assert.same(this.innerHTML, 'H<font face="monospace">el</font>lo');
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

      TH.mouseDownUp('button.myButton');

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
        });
      },


      "test set fontName": function () {
        TH.mouseDownUp('.rtToolbar [name=fontName]');

        assert.dom('.glassPane', function () {
          assert.dom('li>font[face="sans-serif"]', 'Sans serif');
          TH.click('li>font[face="poster"]', 'Poster');
        });

        assert.dom('.input', function () {
          assert.dom('font[face="poster"]');
        });

        assert.dom('[name=fontName]', 'Poster');
      },

      "test set fontSize": function () {
        TH.mouseDownUp('.rtToolbar [name=fontSize]');

        assert.dom('.glassPane', function () {
          TH.click('li>font[size="4"]', 'Large');
        });

        assert.dom('.input', function () {
          assert.dom('font[size="4"]');
        });
      },

      "test set fontColor": function () {
        TH.mouseDownUp('.rtToolbar [name=fontColor]');

        assert.dom('#ColorPicker', function () {
          TH.input('[name=hex]', '00ff00');
          TH.click('[name=apply]');
        });

        assert.dom('.input', function () {
          assert.dom('font[color="#00ff00"]');
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

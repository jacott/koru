isClient && define(function (require, exports, module) {
  var test, v;
  var koru = require('koru');
  var TH = require('./test-helper');
  var Dom = require('koru/dom');
  var util = require('koru/util');
  var sut = require('./rich-text-editor-toolbar');
  var RichTextEditor = require('./rich-text-editor');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      var editor = sut.$autoRender({content: Dom.h([
        {b: "Hello"}, ' ', {i: "world"}, ' ', {a: "the link", $href: "/link.html"}
      ]), options: {id: "Foo"}, extend: {
        mentions: {'@': {
          buttonClass: 'myButton',
          list: function () {}
        }}}});

      v.origText = editor.value;
      document.body.appendChild(editor);

    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "test rendering": function () {
      assert.dom('#Foo.richTextEditor', function () {
        assert.dom('>.rtToolbar:first-child>div', function () {
          assert.dom('button[name=bold]', 'B', function () {v.bold = this});
          assert.dom('button[name=italic]', 'I', function () {v.italic = this});
          assert.dom('button[name=underline]', 'U', function () {v.underline = this});
          assert.dom('button[name=link]', '', function () {v.link = this});

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

      assert.dom('body>.rtLink', function () {
        assert.dom('input', {value: '/link.html'}, function () {
          TH.trigger(this, 'focusout');
        });
      });

      assert.calledOnce(koru.afTimeout);
      document.activeElement.blur();

      assert.dom('.rtLink');
      TH.yieldAfTimeout();
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
        assert.dom('input', function () {
          this.focus();
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

    "test adding link with selection": function () {
      assert.dom('b', 'Hello', function () {
        TH.setRange(this.firstChild, 0, this.firstChild, 2);
        TH.trigger(this, 'keyup');
      });

      TH.mouseDownUp('[name=link]');

      assert.dom('.rtLink', function () {
        assert.dom('label>.name+input', {value: 'http://'}, function () {
          this.focus();
          TH.input(this, 'http://new.link.co/foo');
        });
        TH.trigger(this, 'submit');
      });
      assert.dom('.richTextEditor>.input', function () {
        assert.dom('a[href="http://new.link.co/foo"]', 'He');
        assert.same(this, document.activeElement);
        assert.dom('a', {count: 2});
      });
    },

    "test adding link no selection": function () {
      assert.dom('b', 'Hello', function () {
        TH.setRange(this.firstChild, 2);
        TH.trigger(this, 'keyup');
      });

      TH.mouseDownUp('[name=link]');

      assert.dom('.rtLink', function () {
        assert.dom('label>.name+input', {value: 'http://'}, function () {
          this.focus();
          TH.input(this, 'http://new.link.co/foo');
        });
        TH.trigger(this, 'submit');
      });
      assert.dom('.richTextEditor>.input', function () {
        assert.dom('b', 'Hehttp://new.link.co/foollo', function () {
          assert.dom('a[href="http://new.link.co/foo"]', 'http://new.link.co/foo');
        });
        assert.same(this, document.activeElement);
        assert.dom('a', {count: 2});
      });
    },


    "test adding link no caret": function () {
      window.getSelection().removeAllRanges();
      assert.dom('b', 'Hello', function () {
        TH.trigger(this, 'keyup');
      });

      TH.trigger('[name=link]', 'mousedown');
      TH.trigger('[name=link]', 'mouseup');

      refute.dom('.rtLink');
    },

    "test canceling link": function () {
      assert.dom('.richTextEditor', function () {
        assert.dom('b', 'Hello', function () {
          TH.setRange(this.firstChild);
          TH.trigger(this, 'keyup');
        });

        TH.mouseDownUp('[name=link]');
      });

      TH.click('.rtLink [name=cancel]');

      assert.dom('.richTextEditor', function () {
        assert.same(this.value.innerHTML, v.origText.innerHTML);
        assert.dom('.input', function () {
          assert.same(this, document.activeElement);
        });

        TH.mouseDownUp('[name=link]');
      });

      TH.trigger('.rtLink input', 'keyup', {which: 27});

      refute.dom('.rtLink');

      assert.dom('.richTextEditor', function () {
        assert.same(this.value.innerHTML, v.origText.innerHTML);
        assert.dom('.input', function () {
          assert.same(this, document.activeElement);
        });
      });
    },
  });
});

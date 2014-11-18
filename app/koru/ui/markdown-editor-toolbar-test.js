isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./markdown-editor-test-helper');
  var Dom = require('../dom');
  var MarkdownEditor = require('./markdown-editor');
  var koru = require('../main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};

      TH.initMarkdownEditor(v);

      document.body.appendChild(v.tpl.$autoRender({content: v.origText = '**Hello** *world* [the link](/link.html)'}));
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "test rendering": function () {
      assert.dom('.mdEditor', function () {
        assert.dom('>.mdToolbar>div', function () {
          assert.dom('button[name=bold]', 'B', function () {v.bold = this});
          assert.dom('button[name=italic]', 'I', function () {v.italic = this});
          assert.dom('button[name=link]', '', function () {v.link = this});
        });
        assert.dom('>.input', function () {
          assert.dom('b', 'Hello', function () {
            v.setCaret(this, 2);
            Dom.getCtx(this).updateAllTags();
            refute.className(v.bold, 'on');
            TH.trigger(this, 'mousedown');
            TH.trigger(this, 'mouseup');
            assert.className(v.bold, 'on');
          });
          assert.dom('i', 'world', function () {
            v.setCaret(this, 1);
            Dom.getCtx(this).updateAllTags();
            refute.className(v.italic, 'on');
            TH.trigger(this, 'keyup');
            refute.className(v.bold, 'on');
            assert.className(v.italic, 'on');
          });
          assert.dom('a', 'the link', function () {
            v.setCaret(this, 1);
            Dom.getCtx(this).updateAllTags();
            refute.className(v.link, 'on');
            v.lnbb = this.getBoundingClientRect();

            TH.trigger(this, 'keyup');
            refute.className(v.italic, 'on');
            assert.className(v.link, 'on');
          });
        });

        refute.dom('.mdLink');
        TH.trigger(v.link, 'mousedown');
        TH.trigger(v.link, 'mouseup');

        test.stub(koru, 'afTimeout');

        assert.dom('.mdLink', function () {
          // css settings
          this.style.position = 'absolute';
          // end of css settings

          var inbb = this.getBoundingClientRect();

          assert.near(inbb.left, v.lnbb.left, 0.1);
          assert.near(inbb.top, v.lnbb.bottom, 0.1);
          assert.dom('input', {value: '/link.html'}, function () {
            TH.trigger(this, 'focusout');
          });
        });

        assert.calledOnce(koru.afTimeout);
        document.activeElement.blur();

        assert.dom('.mdLink');
        koru.afTimeout.yield();
        refute.dom('.mdLink');

        assert.dom('i', 'world', function () {
          v.setCaret(this, 3);
          this.parentNode.focus();
          TH.trigger(this, 'mousedown');
          TH.trigger(this, 'mouseup');
          assert.className(v.italic, 'on');
          refute.className(v.link, 'on');
        });
      });
    },

    "test changeing href": function () {
      assert.dom('a', 'the link', function () {
        v.setCaret(this, 1);
        TH.trigger(this, 'keyup');
      });

      TH.trigger('[name=link]', 'mousedown');
      TH.trigger('[name=link]', 'mouseup');

      assert.dom('.mdLink', function () {
        assert.dom('input', function () {
          this.focus();
          TH.input(this, 'http://new/value');
        });
        TH.trigger(this, 'submit');
      });
      assert.dom('.mdEditor>.input', function () {
        assert.dom('a[href="http://new/value"]', 'the link');
        assert.same(this, document.activeElement);
      });
    },

    "test un/making bold": function () {
      assert.dom('.mdEditor>.input', function () {
        this.focus();
        assert.dom('b', 'Hello', function () {
          var range = document.createRange();
          range.selectNode(this);
          Dom.MarkdownEditor.setRange(range);
          TH.trigger(this, 'keyup');
        });
      });

      TH.trigger('[name=bold]', 'mouseup');

      assert.dom('.mdEditor', function () {
        assert.msg('"Hello" should stil be bold if no mousedown')
          .same(this.value, '**Hello** *world* [the link](/link.html)');
      });

      TH.trigger('[name=bold]', 'mousedown');
      TH.trigger('[name=bold]', 'mouseup');

      assert.dom('.mdEditor', function () {
        assert.same(this.value, 'Hello *world* [the link](/link.html)');
      });
    },

    "test adding link with selection": function () {
      assert.dom('b', 'Hello', function () {
        v.setCaret(this, 2, true);
        TH.trigger(this, 'keyup');
      });

      TH.trigger('[name=link]', 'mousedown');
      TH.trigger('[name=link]', 'mouseup');

      assert.dom('.mdLink', function () {
        assert.dom('label>.name+input', {value: 'http://'}, function () {
          this.focus();
          TH.input(this, 'http://new.link.co/foo');
        });
        TH.trigger(this, 'submit');
      });
      assert.dom('.mdEditor>.input', function () {
        assert.dom('a[href="http://new.link.co/foo"]', 'He');
        assert.same(this, document.activeElement);
        assert.dom('a', {count: 2});
      });
    },

    "test adding link no selection": function () {
      assert.dom('b', 'Hello', function () {
        v.setCaret(this, 2);
        TH.trigger(this, 'keyup');
      });

      TH.trigger('[name=link]', 'mousedown');
      TH.trigger('[name=link]', 'mouseup');

      assert.dom('.mdLink', function () {
        assert.dom('label>.name+input', {value: 'http://'}, function () {
          this.focus();
          TH.input(this, 'http://new.link.co/foo');
        });
        TH.trigger(this, 'submit');
      });
      assert.dom('.mdEditor>.input', function () {
        if (Dom.vendorPrefix === 'moz') {
          // broken for mozilla see https://bugzilla.mozilla.org/show_bug.cgi?id=895510
          refute.dom('a[href="http://new.link.co/foo"]');

        } else {
          assert.dom('b', 'Hehttp://new.link.co/foollo', function () {
            assert.dom('a[href="http://new.link.co/foo"]', 'http://new.link.co/foo');
          });
          assert.same(this, document.activeElement);
          assert.dom('a', {count: 2});
        }
      });
    },


    "test adding link no caret": function () {
      window.getSelection().removeAllRanges();
      assert.dom('b', 'Hello', function () {
        TH.trigger(this, 'keyup');
      });

      TH.trigger('[name=link]', 'mousedown');
      TH.trigger('[name=link]', 'mouseup');

      refute.dom('.mdLink');
    },

    "test canceling link": function () {
      assert.dom('.mdEditor', function () {
        assert.dom('b', 'Hello', function () {
          v.setCaret(this);
          TH.trigger(this, 'keyup');
        });

        TH.trigger('[name=link]', 'mousedown');
        TH.trigger('[name=link]', 'mouseup');

        TH.click('.mdLink [name=cancel]');

        assert.same(this.value, v.origText);
        assert.dom('.input', function () {
          assert.same(this, document.activeElement);
        });

        TH.trigger('[name=link]', 'mousedown');
        TH.trigger('[name=link]', 'mouseup');

        TH.trigger('.mdLink input', 'keyup', {which: 27});

        refute.dom('.mdLink');

        assert.same(this.value, v.origText);
        assert.dom('.input', function () {
          assert.same(this, document.activeElement);
        });
      });
    },
  });
});

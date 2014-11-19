isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./markdown-editor-test-helper');
  var Dom = require('../dom');
  var util = require('../util');
  var MarkdownEditor = require('./markdown-editor');
  var Markdown = require('./markdown');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};

      TH.initMarkdownEditor(v);
    },

    tearDown: function () {
      Dom.removeChildren(document.body);
      delete Dom.Test;
      v = null;
    },

    "test getCaretRect": function () {
      var getCaretRect = MarkdownEditor.getCaretRect;

      document.body.appendChild(Dom.html('<div id="top">start <br> right <p>here</p></div>'));

      assert.dom('#top', function () {
        v.range = document.createRange();
        v.range.setStart(this, 0);
        v.range.setEnd(this, 0);
        v.bb = getCaretRect(v.range);

        v.range.selectNode(this.firstChild);
        assert.equals(v.bb, v.range.getClientRects()[0]);

        v.range.selectNode(this.childNodes[2]);

        assert.equals(getCaretRect(v.range), v.range.getClientRects()[0]);

        assert.dom('p', function () {
          v.range = document.createRange();
          v.range.selectNode(this);
          assert.equals(getCaretRect(v.range), this.getBoundingClientRect());
        });
      });
    },

    "test rendering": function () {
      document.body.appendChild(v.tpl.$autoRender({content: "**Hello** *world*", foos: "boo"}));

      assert.dom('#TestMarkdownEditor', function () {
        assert.dom('.mdEditor.foo.bar:not([atList])', function () {
          assert.dom('>.input[contenteditable=true]', 'Hello world', function () {
            TH.trigger(this, 'focusin');
            assert.className(this.parentNode, 'focus');
            assert.dom('b' ,'Hello');
            assert.dom('i' ,'world', function () {
              v.setCaret(this, 2);
              document.execCommand('insertText', false, ' foo ');
            });
            TH.trigger(this, 'focusout');
            refute.className(this.parentNode, 'focus');
          });
          assert.same(this.value, '**Hello** *wo foo rld*');
        });
      });
    },

    "test getRange": function () {
      window.getSelection().removeAllRanges();
      assert.isNull(MarkdownEditor.getRange());
      assert.isNull(MarkdownEditor.getTag('A'));
    },

    "test bold, italic, underline": function () {
      v.ec = test.stub(document, 'execCommand');

      document.body.appendChild(v.tpl.$autoRender({content: ''}));

      assert.dom('.input', function () {
        TH.trigger(this, 'keydown', {which: 66, ctrlKey: true});
        TH.trigger(this, 'keydown', {which: 66, ctrlKey: false});
        assert.calledOnceWith(v.ec, 'bold');

        TH.trigger(this, 'keydown', {which: 73, ctrlKey: true});
        assert.calledWith(v.ec, 'italic');

        TH.trigger(this, 'keydown', {which: 85, ctrlKey: true});
        assert.calledWith(v.ec, 'underline');
      });
    },

    "paste": {
      setUp: function () {
        v.ec = test.stub(document, 'execCommand');
        v.event = {
          clipboardData: {
            items: [{type: 'text/html'}],
            getData: test.stub().withArgs('text/html').returns('<b>bold</b>'),
          },
        };

        v.slot = TH.findDomEvent(MarkdownEditor.Input, 'paste')[0];
        v.paste = v.slot[2];
        v.slot[2] = test.stub();
        test.stub(Dom, 'stopEvent');

        document.body.appendChild(v.tpl.$autoRender({content: ''}));

        v.input = document.body.getElementsByClassName('input')[0];
      },

      tearDown: function () {
        if (v.slot) v.slot[2] = v.paste;
      },

      "test wiried": function () {
        TH.trigger(v.input, 'paste');

        assert.called(v.slot[2]);
      },

      "test no clipboard": function () {
        delete v.event.clipboardData;

        v.paste(v.event);

        refute.called(Dom.stopEvent);
      },

      "test no insertHTML": function () {
        var insertHTML = v.ec.withArgs('insertHTML').returns(false);
        var insertText = v.ec.withArgs('insertText').returns(true);

        v.paste(v.event);

        assert.called(Dom.stopEvent);

        assert.calledWith(insertText, 'insertText', false, '**bold**');
      },

      "test insertHTML": function () {
        var insertHTML = v.ec.withArgs('insertHTML').returns(true);
        var insertText = v.ec.withArgs('insertText').returns(true);

        v.paste(v.event);

        assert.called(Dom.stopEvent);

        refute.called(insertText);
        assert.calledWith(insertHTML, 'insertHTML', false, '<b>bold</b>');
      },
    },

    "test empty class": function () {
      document.body.appendChild(v.tpl.$autoRender({content: ''}));

      assert.dom('#TestMarkdownEditor', function () {
        assert.dom('.mdEditor.empty>.input[contenteditable=true]', '', function () {
          this.innerHTML = '<b>Brave <i>new</i> World</b>';
          TH.trigger(this, 'input');

          assert.same(Markdown.fromHtml(this), "**Brave _new_ World**");
          refute.className(this.parentNode, 'empty');

          TH.input(this, ' ');
          refute.className(this.parentNode, 'empty');

          TH.input(this, '');
          assert.className(this.parentNode, 'empty');
        });
      });
    },
  });
});

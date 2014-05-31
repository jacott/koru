isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./markdown-editor-test-helper');
  var Dom = require('../dom');
  require('./markdown-editor');
  var Markdown = require('./markdown');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};

      TH.initMarkdownEditor(v);

      test.spy(Dom, 'stopEvent');

      v.fooFunc = test.stub();
      document.body.appendChild(v.tpl.$autoRender({content: 'hello ', foos: function() {
        return function (frag, text) {v.fooFunc(frag, text)};
      }}));

      document.getElementById('TestMarkdownEditor').style.position = 'relative';

      v.input = document.body.getElementsByClassName('input')[0];

      v.sel = window.getSelection();

      v.range = document.createRange();
      v.range.setStart(v.input.firstChild, v.input.firstChild.textContent.length);
      v.range.collapse(true);
      v.input.focus();

      v.sel.removeAllRanges();
      v.sel.addRange(v.range);
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "test typing @g": function () {
      assert.dom(v.input, function () {
        assert.same(Markdown.fromHtml(v.range.startContainer.parentNode), 'hello ');
        TH.keypress(this, '@', true);
        assert.called(Dom.stopEvent);
        assert.same(v.sel, window.getSelection());
        v.lm = v.sel.getRangeAt(0).startContainer.parentNode;
        assert.same(v.lm.tagName, 'SPAN');
        assert.className(v.lm, 'lm');

        assert.same(v.lm.textContent, '@');
      });
      refute.dom('#TestMarkdownEditor>.mdList');

      assert.dom(v.input, function () {
        Dom.stopEvent.reset();
        TH.trigger(this, 'keydown', {which: 16}); // shift should not matter
        TH.trigger(v.lm, 'keypress', {which: 'g'.charCodeAt(0)});
        assert.called(Dom.stopEvent);
        assert.same(v.lm.textContent, '@g');
        assert.same(v.lm.lastChild.textContent, 'g');
      });

      assert.dom('.mdEditor>.mdList', function () {
        assert.dom('input', {value: 'g'}, function () {
          assert.same(document.activeElement, this);
        });
      });
    },

    "test @ followed by -> ->": function () {
      assert.dom(v.input, function () {
        TH.keypress(this, '@', true);
        assert.same(Markdown.fromHtml(this), 'hello @');
        TH.trigger(this, 'keydown', {which: 39});
        TH.trigger(this, 'keydown', {which: 39});
        var ctx = Dom.getCtx(this);
        assert.same(ctx.mentionState, null);

        refute.dom('.lm');

        assert.same(Markdown.fromHtml(this), 'hello @');
      });
    },

    "test @ after div": function () {
      assert.dom(v.input, function () {
        document.execCommand('insertText', null, "\n");
        TH.keypress(this, '@', true);
        TH.keypress(this, 'g');

        assert.dom('span.lm>span.ln');
      });
    },

    "at list menu": {
      setUp: function () {
        v.fooFunc = function (frag, text) {
          if (text === 'g') {
            frag.appendChild(v.div1 = Dom.html({text: 'Geoff Jacobsen', "data-id": "g1"}));
            frag.appendChild(v.div2 = Dom.html({text: 'Gordon Snow', "data-id": "g2"}));
            frag.appendChild(v.div3 = Dom.html({text: 'Gayle Gunter', "data-id": "g3"}));
          }
          if (text === 'jjg') {
            frag.appendChild(v.div2 = Dom.html({text: 'James J Gooding', "data-id": "j2"}));
            frag.appendChild(v.div3 = Dom.html({text: '(*)', "data-id": "j3", span: {className: 'name', text: 'Josiah<JG>'}}));
          }
        };

        assert.dom(v.input, function () {
          TH.keypress(this, '@', true);
          TH.keypress(this, 'g');
        });
      },

      "test empty": function () {
        TH.input('input', 'jjg');
        assert.dom('.mdList>div:not(.empty)');
        TH.input('input', 'jjgx');
        assert.dom('.mdList>div.empty');
        TH.input('input', 'jjg');
        assert.dom('.mdList>div:not(.empty)');
      },

      "test input and click": function () {
        assert.dom('.mdList', function () {
          assert.dom('>div>div', {count: 3});
          assert.dom('>div>div:first-child.selected', function () {
            assert.same(this, v.div1);
          });

          TH.input('input', 'jjg');

          assert.dom('>div>div', {count: 2});
          assert.dom('>div>div:first-child.selected', function () {
            assert.same(this, v.div2);
          });
          assert.dom('>div>div:last-child', function () {
            assert.same(this, v.div3);
            TH.trigger(this, 'mousedown');
            TH.trigger(this, 'mouseup');
          });
        });

        refute.dom('.mdList');

        assert.dom(v.input, function () {
          refute.dom('.lm');
          refute.dom('.ln');
          assert.dom('[data-a="j3"][contenteditable=false]', 'Josiah<JG>');
        });
      },

      "test focusout aborts list": function () {
        assert.dom('.mdList', function () {
          TH.trigger('.mdList>div>*', 'mousedown');
          assert.isTrue(Dom.getCtx(this).mousedown);
          TH.trigger(this, 'focusout');
          assert.isNull(Dom.getCtx(this).mousedown);
        });

        assert.dom('.mdList');

        assert.dom('.mdList', function () {
          TH.trigger(this, 'focusout');
        });

        refute.dom('.mdList');
      },

      "test tab": function () {
        TH.trigger('input', 'keydown', {which: 9});

        assert.dom('.input', function () {
          assert.same(Markdown.fromHtml(this), 'hello @[Geoff Jacobsen](g1) ');
        });
      },

      "test shift tab": function () {
        TH.trigger('input', 'keydown', {which: 9, shiftKey: true});

        refute.dom('.mdList');

        assert.dom(v.input, function () {
          assert.same(Markdown.fromHtml(this), 'hello @g');

          refute.dom('.ln');
          refute.dom('.lm');

          document.execCommand('insertText', null, 'w');
          assert.same(Markdown.fromHtml(this), 'hello w');
        });
      },

      "test mouseover": function () {
        TH.trigger(v.div3, 'mouseover');
        assert.same(document.getElementsByClassName('selected').length, 1);
        assert.className(v.div3, 'selected');

        TH.trigger(v.div1, 'mouseover');
        assert.same(document.getElementsByClassName('selected').length, 1);
        assert.className(v.div1, 'selected');
      },

      "test keydown, keyup, enter ": function () {
        assert.dom('.mdList', function () {
          assert.dom('input', function () {
            TH.trigger(this, 'keydown', {which: 40});
            refute.className(v.div1, 'selected');
            assert.className(v.div2, 'selected');
            TH.trigger(this, 'keydown', {which: 40});
            refute.className(v.div2, 'selected');
            assert.className(v.div3, 'selected');

            TH.trigger(this, 'keydown', {which: 40});
            assert.className(v.div3, 'selected');

            TH.trigger(this, 'keydown', {which: 38});
            refute.className(v.div3, 'selected');
            assert.className(v.div2, 'selected');

            TH.trigger(this, 'keydown', {which: 38});
            refute.className(v.div2, 'selected');
            assert.className(v.div1, 'selected');

            TH.trigger(this, 'keydown', {which: 38});
            refute.className(v.div2, 'selected');
            assert.className(v.div1, 'selected');

            TH.trigger(this, 'keydown', {which: 40});
            TH.trigger(this, 'keydown', {which: 13});
          });
        });

        refute.dom('.mdList');

        assert.dom(v.input, function () {
          refute.dom('.lm');
          refute.dom('.ln');
          assert.dom('[data-a="g2"][contenteditable=false]', 'Gordon Snow');
        });
      },
    },

    "test input box sizing": function () {
      assert.dom(v.input, function () {
        TH.keypress(this, '@', true);
        TH.keypress(this, 'h');
      });

      var ln = document.getElementsByClassName('ln')[0];
      var unbb = ln.getBoundingClientRect();

      assert.dom('.mdList', function () {
        // css settings
        this.style.position = 'absolute';
        this.border = 'none';
        // end of css settings

        assert.dom('input', function () {
          var inbb = this.getBoundingClientRect();

          assert.same(unbb.left, inbb.left);
          assert.same(unbb.top, inbb.top);
          assert.same(unbb.height, inbb.height);
          assert.same(unbb.width + 2, inbb.width);


          v.input.style.marginTop = '10px';
          v.input.style.marginLeft = '5px';

          TH.input(this, 'foo bar');

          assert.same(ln.textContent, 'foo bar');
          unbb = ln.getBoundingClientRect();

          inbb = this.getBoundingClientRect();

          assert.same(unbb.left, inbb.left);
          assert.same(unbb.top, inbb.top);
          assert.same(unbb.height, inbb.height);
          assert.same(unbb.width + 2, inbb.width);
        });
      });
    },

    "keydown": {
      setUp: function () {
        assert.dom(v.input, function () {
          TH.keypress(this, '@', true);
          TH.keypress(this, 'h');
        });
      },

      "test deleting @": function () {
        assert.dom('.mdList>input', function () {
          TH.input(this, '');
          TH.trigger(this, 'keydown', {which: 8});
        });

        assert.dom(v.input, function () {
          refute.dom('.ln');
          refute.dom('.lm');

          assert.same(Markdown.fromHtml(this), 'hello ');
        });
        refute.dom('.mdList');
      },

      "test arrow left": function () {
        assert.dom('.mdList>input', function () {
          TH.input(this, '');
          TH.trigger(this, 'keydown', {which: 37});
        });

        assert.dom(v.input, function () {
          refute.dom('.ln');
          refute.dom('.lm');

          document.execCommand('insertText', null, 'w');
          assert.same(Markdown.fromHtml(this), 'hello w@');
        });
        refute.dom('.mdList');
      },

      "test escape pressed": function () {
        TH.trigger('.mdList>input', 'keyup', {which: 27});

        assert.dom(v.input, function () {
          assert.same(Markdown.fromHtml(this), 'hello @h');

          refute.dom('.ln');
          refute.dom('.lm');

          document.execCommand('insertText', null, 'w');
          assert.same(Markdown.fromHtml(this), 'hello w');
        });
      },
    },

    "test @ not last keypress": function () {
      assert.dom(v.input, function () {
        TH.keypress(this, '@', true);
        TH.trigger(this, 'keydown', {which: 40});
        TH.trigger(this, 'keydown', {which: 72});
        TH.keypress(this, 'h');
      });

      refute.dom('.mdList');
    },

    "test @ not after space": function () {
      document.execCommand('insertText', null, '.');
      assert.dom(v.input, function () {
        TH.keypress(this, '@', true);
        TH.keypress(this, 'h');
      });

      refute.dom('.mdList');
    },

    "test arrow right": function () {
      assert.dom(v.input, function () {
        TH.keypress(this, '@', true);
        TH.keypress(this, 'h');
      });

      assert.dom('.mdList>input', function () {
        TH.input(this, 'henry');
        this.selectionStart = this.selectionEnd = 4;
        TH.trigger(this, 'keydown', {which: 39});
      });

      assert.dom('.mdList>input', function () {
        this.selectionStart = this.selectionEnd = 5;
        TH.trigger(this, 'keydown', {which: 39});
      });

      assert.dom(v.input, function () {
        refute.dom('.ln');
        refute.dom('.lm');

        document.execCommand('insertText', null, 'w');
        assert.same(Markdown.fromHtml(this), 'hello @henryw');
      });

      refute.dom('.mdList');
    },

    "test .ln removed removes mdList": function () {
      assert.dom(v.input, function () {
        TH.keypress(this, '@', true);
        TH.keypress(this, 'h');
        assert.dom('.ln', function () {
          Dom.remove(this);
        });
        TH.trigger(this, 'keyup');
      });

      refute.dom('.mdList');
    },

    "test clear": function () {
      document.body.appendChild(v.tpl.$autoRender({content: 'hello'}));

      assert.dom('.mdEditor', function () {
        refute.className(this, 'empty');

        assert.dom(v.input, function () {
          TH.keypress(this, '@', true);
          TH.keypress(this, 'h');
        });

        Dom.MarkdownEditor.clear(this);
        assert.dom('>.input', '');
        assert.className(this, 'empty');
      });

      refute.dom('.mdList');
    },

    "test removing editor removes mdList": function () {
      assert.dom(v.input, function () {
        TH.keypress(this, '@', true);
        TH.keypress(this, 'h');
      });

      assert.dom('.mdEditor', function () {
        Dom.remove(this);
      });

      refute.dom('.mdList');
    },

    "test button events don't propagate": function () {
      document.addEventListener('click', v.clicked = test.stub());
      test.onEnd(function () {document.removeEventListener('click', v.clicked)});

      assert.dom(v.input, function () {
        this.appendChild(v.button = Dom.html({tag: 'button'}));
        TH.click(v.button);
        refute.called(v.clicked);
      });
    },

    "test removing mdList": function () {
      assert.dom(v.input, function () {
        TH.keypress(this, '@', true);
        TH.keypress(this, 'h');
      });

      assert.dom('.mdList', function () {
        Dom.remove(this);
      });

      refute.dom('.ln');
      refute.dom('.lm');

      var ctx = Dom.getCtx(v.input);
      assert.same(ctx.selectItem, null);
      assert.same(ctx.mentionState, null);
    },
  });
});

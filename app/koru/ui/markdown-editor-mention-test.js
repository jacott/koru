isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./markdown-editor-test-helper');
  var Dom = require('../dom');
  var MarkdownEditor = require('./markdown-editor');
  var Markdown = require('./markdown');
  var Modal = require('./modal');

  var insert = MarkdownEditor.insert;

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
      TH.trigger(v.input, 'focusin');

      v.sel.removeAllRanges();
      v.sel.addRange(v.range);
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "test button mode": function () {
      v.fooFunc = function (frag, text) {
        if (text === 'g') {
          frag.appendChild(v.div1 = Dom.html({text: 'Geoff Jacobsen', "data-id": "g1"}));
        }
      };

      assert.dom('#TestMarkdownEditor', function () {
        TH.trigger('[name=mention]', 'mousedown');
        TH.trigger('[name=mention]', 'mouseup');

        assert.dom(document.querySelector('.mdMention:not(.inline) input'), function () {
          TH.input(this, 'g');

          TH.trigger(this, 'keydown', {which: 13});
        });

        assert.dom('.mdEditor>.input', function () {
          assert.same(Markdown.fromHtml(this), 'hello @[Geoff Jacobsen](g1)');
          this.innerHTML = '';
        });
      });
    },

    "test typing @g": function () {
      assert.dom(v.input, function () {
        assert.same(Markdown.fromHtml(v.range.startContainer.parentNode), 'hello');
        pressAt(this);
        refute.called(Dom.stopEvent);
      });
      refute.dom('#TestMarkdownEditor>.mdMention');

      assert.dom(v.input, function () {
        TH.trigger(this, 'keydown', {which: 16}); // shift should not matter
        TH.keypress(this, 'g');
        assert.called(Dom.stopEvent);
        assert.same(this.textContent.replace(/\xa0/, ' '), 'hello @g');
        assert.dom('.ln', 'g');
      });

      assert.dom('.mdMention', function () {
        assert.dom('input', {value: 'g'}, function () {
          assert.same(document.activeElement, this);
        });
      });
    },

    "test @ followed by -> ->": function () {
      assert.dom(v.input, function () {
        pressAt(this);
        assert.same(Markdown.fromHtml(this), 'hello @');
        TH.trigger(this, 'keydown', {which: 39});
        TH.trigger(this, 'keydown', {which: 39});
        var ctx = Dom.getCtx(this);
        assert.same(ctx.mentionState, null);

        refute.dom('.ln');

        assert.same(Markdown.fromHtml(this), 'hello @');
      });
    },

    "test @ after div": function () {
      assert.dom(v.input, function () {
        insert("\n");
        pressAt(this);
        TH.keypress(this, 'g');

        assert.dom('span.ln');
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
          pressAt(this);
          TH.keypress(this, 'g');
        });
      },

      "test empty": function () {
        TH.input('input', 'jjg');
        assert.dom('.mdMention.inline>div:not(.empty)');
        TH.input('input', 'jjgx');
        assert.dom('.mdMention.inline>div.empty');

        assert.dom('input', function () {
          var updspy = test.spy(Dom.getCtx(this), 'updateAllTags');
          var mdlspy = test.spy(Modal, 'append');

          TH.input(this, 'jjg');
          assert(updspy.calledBefore(mdlspy));
          assert.calledWith(mdlspy, 'on', TH.match(function (obj) {return obj.noAppend;}));
        });
        assert.dom('.mdMention.inline>div:not(.empty)');
      },

      "test input and click": function () {
        assert.dom('.mdMention', function () {
          assert.dom('>div>div', {count: 3});
          assert.dom('>div>div:first-child.selected', function () {
            assert.same(this, v.div1);
          });

          assert.dom('input', function () {
            this.focus();
            TH.input(this, 'jjg');
          });

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

        refute.dom('.mdMention');

        assert.dom('.mdEditor>.input', function () {
          assert.same(document.activeElement, this);
        });

        assert.dom(v.input, function () {
          refute.dom('.ln');
          assert.dom('[data-a="j3"][contenteditable=true]', 'Josiah<JG>');
        });
      },

      "test focusout aborts list": function () {
        assert.dom('.mdMention', function () {
          TH.trigger('.mdMention>div>*', 'mousedown');
          assert.isTrue(Dom.getCtx(this).mousedown);
          TH.trigger(this, 'focusout');
          assert.isNull(Dom.getCtx(this).mousedown);
        });

        assert.dom('.mdMention');

        assert.dom('.mdMention', function () {
          TH.trigger(this, 'focusout');
        });

        refute.dom('.mdMention');
      },

      "test tab": function () {
        TH.trigger('input', 'keydown', {which: 9});

        assert.dom('.input', function () {
          assert.same(Markdown.fromHtml(this), 'hello @[Geoff Jacobsen](g1)');
        });
      },

      "test shift tab": function () {
        TH.trigger('input', 'keydown', {which: 9, shiftKey: true});

        refute.dom('.mdMention');

        assert.dom(v.input, function () {
          assert.same(Markdown.fromHtml(this), 'hello @g');

          refute.dom('.ln');

          insert('w');
          assert.same(Markdown.fromHtml(this), 'hello @w');
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
        assert.dom('.mdMention', function () {
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

        refute.dom('.mdMention');

        assert.dom(v.input, function () {
          refute.dom('.ln');
          assert.dom('[data-a="g2"][contenteditable=true]', 'Gordon Snow');
        });
      },
    },

    "test input box uses modal": function () {
      test.spy(Modal, 'append');
      assert.dom(v.input, function () {
        pressAt(this);
        TH.keypress(this, 'h');
      });

      var ln = document.getElementsByClassName('ln')[0];
      var unbb = ln.getBoundingClientRect();

      assert.dom('body>.mdMention', function () {
        assert.calledWith(Modal.append, 'on', {container: this, popup: this, noAppend: TH.match.falsy, origin: TH.match.field('tagName', 'SPAN')});
        var minp = this.querySelector('input');
        assert.dom('.empty', function () {
          assert.calledWith(Modal.append, 'below', {container: this, popup: this, noAppend: true, origin: minp});
        });
      });
    },

    "keydown": {
      setUp: function () {
        assert.dom(v.input, function () {
          pressAt(this);
          TH.keypress(this, 'h');
        });
      },

      "test deleting @": function () {
        assert.dom('.mdMention>input', function () {
          TH.input(this, '');
          TH.trigger(this, 'keydown', {which: 8});
        });

        assert.dom(v.input, function () {
          refute.dom('.ln');

          assert.same(Markdown.fromHtml(this), 'hello');
        });
        refute.dom('.mdMention');
      },

      "test arrow left": function () {
        assert.dom('.mdMention>input', function () {
          TH.input(this, '');
          TH.trigger(this, 'keydown', {which: 37});
        });

        assert.dom(v.input, function () {
          refute.dom('.ln');

          assert.same(document.activeElement, this);

          insert('w');
          assert.same(Markdown.fromHtml(this), 'hello w@');
        });
        refute.dom('.mdMention');
      },

      "test escape pressed": function () {
        TH.trigger('.mdMention>input', 'keyup', {which: 27});

        assert.dom(v.input, function () {
          assert.same(Markdown.fromHtml(this), 'hello @h');

          refute.dom('.ln');

          insert('w');
          assert.same(Markdown.fromHtml(this), 'hello @w');
        });
      },
    },

    "test @ not last keypress": function () {
      assert.dom(v.input, function () {
        pressAt(this);
        TH.trigger(this, 'keydown', {which: 40});
        TH.trigger(this, 'keydown', {which: 72});
        TH.keypress(this, 'h');
      });

      refute.dom('.mdMention');
    },

    "test @ not after space": function () {
      insert('.');
      assert.dom(v.input, function () {
        pressAt(this);
        TH.keypress(this, 'h');
      });

      refute.dom('.mdMention');
    },

    "test arrow right": function () {
      assert.dom(v.input, function () {
        pressAt(this);
        TH.keypress(this, 'h');
      });

      assert.dom('.mdMention>input', function () {
        TH.input(this, 'henry');
        this.selectionStart = this.selectionEnd = 4;
        TH.trigger(this, 'keydown', {which: 39});
      });

      assert.dom('.mdMention>input', function () {
        this.selectionStart = this.selectionEnd = 5;
        TH.trigger(this, 'keydown', {which: 39});
      });

      assert.dom(v.input, function () {
        refute.dom('.ln');

        insert('w');
        assert.same(Markdown.fromHtml(this), 'hello @henryw');
      });

      refute.dom('.mdMention');
    },

    "test .ln removed removes mdMention": function () {
      assert.dom(v.input, function () {
        pressAt(this);
        TH.keypress(this, 'h');
        assert.dom('.ln', function () {
          Dom.remove(this);
        });
        TH.trigger(this, 'keyup');
      });

      refute.dom('.mdMention');
    },

    "test clear": function () {
      document.body.appendChild(v.tpl.$autoRender({content: 'hello'}));

      assert.dom('.mdEditor', function () {
        assert.dom(v.input, function () {
          pressAt(this);
          TH.keypress(this, 'h');
        });

        Dom.MarkdownEditor.clear(this);
        assert.dom('>.input', '');
      });

      refute.dom('.mdMention');
    },

    "test removing editor removes mdMention": function () {
      assert.dom(v.input, function () {
        pressAt(this);
        TH.keypress(this, 'h');
      });

      assert.dom('.mdEditor', function () {
        Dom.remove(this);
      });

      refute.dom('.mdMention');
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

    "test removing mdMention": function () {
      assert.dom(v.input, function () {
        pressAt(this);
        TH.keypress(this, 'h');
      });

      assert.dom('.mdMention', function () {
        Dom.remove(this);
      });

      refute.dom('.ln');

      var ctx = Dom.getCtx(v.input);
      assert.same(ctx.selectItem, null);
      assert.same(ctx.mentionState, null);
    },
  });

  function pressAt(elm) {
    TH.keypress(elm, '@', 'shift');
    insert('@');
  }
});

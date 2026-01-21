isClient && define((require, exports, module) => {
  'use strict';
  const RichText        = require('koru/dom/rich-text');
  const Modal           = require('./modal');
  const RichTextEditor  = require('./rich-text-editor');
  const RichTextEditorToolbar = require('./rich-text-editor-toolbar');
  const TH              = require('./test-helper');
  const Dom             = require('../dom');

  const {stub, spy, match: m} = TH;

  const {insert} = RichTextEditor;

  let v = {};

  const pressChar = (ctx, char) => {
    insert(char);
    ctx.undo.recordNow();
    TH.trigger(ctx.inputElm, 'selectionchange');
  };

  const moveRange = (ctx, elm, offset) => {
    Dom.setRange(RichTextEditor.nodeRange(elm, offset));
    TH.trigger(ctx.inputElm, 'selectionchange');
  };

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    beforeEach(() => {
      spy(Dom, 'stopEvent');

      v.fooFunc = stub();
      document.body.appendChild(
        RichTextEditorToolbar.$autoRender({
          content: document.createTextNode('hello\xa0'),
          options: {id: 'TestRichTextEditor'},
          extend: {
            mentions: {
              '@': {
                buttonClass: 'atMention',
                list(frag, text, ctx) {
                  return v.fooFunc(frag, text, ctx);
                },
                html(elm, ctx) {
                  return v.fooHtmlFunc(elm, ctx);
                },
              },
            },
          },
        }),
      );

      document.getElementById('TestRichTextEditor').style.position = 'relative';

      v.input = document.body.getElementsByClassName('input')[0];
      v.inputCtx = Dom.ctx(v.input);

      TH.setRange(v.input.firstChild, v.input.firstChild.textContent.length);
      v.input.focus();
      TH.trigger(v.input, 'focusin');
    });

    afterEach(() => {
      TH.domTearDown();
      v = {};
    });

    group('toolbar', () => {
      beforeEach(() => {
        stub(Dom, 'stopClick');
        v.input.appendChild(Dom.h(['one', {div: ['two ', 'three']}]));

        v.range = TH.setRange(v.input.lastChild.lastChild, 2);
        v.fooFunc = (frag, text) => {
          if (text === 'g') {
            frag.appendChild(v.div1 = Dom.h({div: 'Geoff Jacobsen', '$data-id': 'g1'}));
          }
        };

        TH.pointerDownUp('[name=mention]');

        v.fooHtmlFunc = (elm) =>
          Dom.h({a: elm.textContent, class: 'foo', $href: '/#' + elm.getAttribute('data-id')});
      });

      test('accept', () => {
        const {inputCtx} = v;
        assert.isTrue(inputCtx.undo.paused);
        assert(Modal.topModal.handleTab);

        assert.dom('.rtMention:not(.inline)[touch-action=none] input', (input) => {
          TH.input(input, 'g');

          TH.trigger(input, 'keydown', {which: 13});
        });

        assert.isFalse(inputCtx.undo.paused);

        assert.dom('.richTextEditor>.input', (input) => {
          assert.same(document.activeElement, input);
          RichTextEditor.insert('_x_');
          assert.dom('a[class=foo][href="/#g1"]', 'Geoff Jacobsen', (link) => {
            assert.match(link.nextSibling.textContent, /_x_/);
          });
          assert.dom('a[href="/#g1"][class="foo"]', 'Geoff Jacobsen');
          assert.same(
            input.innerHTML.replace(/<a[^>]*>/, '<a>').replace(/&nbsp;/g, ' '),
            'hello one<div>two th<a>Geoff Jacobsen</a> _x_ree</div>',
          );
        });
      });

      test('cancel', () => {
        const {inputCtx} = v;
        assert.dom('.rtMention:not(.inline) input', (input) => {
          TH.input(input, 'g');
        });
        assert.isTrue(inputCtx.undo.paused);
        TH.click('.glassPane');
        assert.isFalse(inputCtx.undo.paused);
        assert.same(document.activeElement, v.input);
        assert.rangeEquals(undefined, v.range.startContainer, v.range.startOffset);
      });
    });

    test('typing @g', () => {
      const {input, inputCtx} = v;
      assert.dom(input, () => {
        pressChar(inputCtx, '@');
      });
      refute.dom('#TestRichTextEditor>.rtMention');
      assert.isFalse(inputCtx.undo.paused);

      assert.dom(input, () => {
        pressChar(inputCtx, 'g');
        assert.same(input.textContent.replace(/\xa0/, ' '), 'hello @g');
        assert.dom('.ln', 'g');
      });
      assert.isTrue(inputCtx.undo.paused);

      assert.dom('.rtMention', () => {
        assert(Modal.topModal.handleTab);
        assert.dom('input', {value: 'g'}, (elm) => {
          assert.same(document.activeElement, elm);
        });
      });
    });

    test('midtext @g', () => {
      moveRange(v.inputCtx, v.input.firstChild, 2);
      pressChar(v.inputCtx, ' ');
      pressChar(v.inputCtx, '@');
      pressChar(v.inputCtx, 'g');
      assert.dom('span.ln');

      Dom.remove(v.inputCtx.selectItem);

      refute.dom('span.ln');
    });

    test('@ followed by -> ->', () => {
      const {input, inputCtx} = v;
      pressChar(inputCtx, '@');
      assert.same(input.innerHTML, 'hello @');
      assert.isFalse(inputCtx.undo.paused);

      moveRange(inputCtx, input.firstChild, 6);
      moveRange(inputCtx, input.firstChild, 7);
      assert.same(inputCtx.mention.elm, null);

      pressChar(inputCtx, 'g');

      refute.dom('.ln');

      assert.same(input.innerHTML, 'hello @g');
      assert.isFalse(inputCtx.undo.paused);
    });

    test('@ after div', () => {
      pressChar(v.inputCtx, '\n');
      pressChar(v.inputCtx, '@');
      pressChar(v.inputCtx, 'g');

      assert.dom('span.ln');
    });

    test('ctx', () => {
      v.fooFunc = (frag, text, ctx) => {
        if (ctx.foo) {
          frag.appendChild(Dom.h({div: 'yes foo', '$data-id': 'yesfoo'}));
        } else {
          ctx.foo = true;
          ctx.data.value = 'now foo';
          frag.appendChild(Dom.h({div: 'no foo', '$data-id': 'nofoo'}));
        }
      };

      pressChar(v.inputCtx, '@');
      pressChar(v.inputCtx, 'x');

      assert.dom('.rtMention.inline', (elm) => {
        assert.dom('div:first-child', 'no foo');
      });

      assert.dom('input', {value: 'now foo'}, (elm) => {
        TH.input(elm, 'z');
      });

      assert.dom('.rtMention.inline', (elm) => {
        assert.dom('div:first-child', 'yes foo');
      });
    });

    test('needMore', () => {
      v.fooFunc = (frag, text) => true;

      pressChar(v.inputCtx, '@');
      pressChar(v.inputCtx, 'g');

      assert.dom('.rtMention div.empty.needMore');
    });

    group('at list menu', () => {
      beforeEach(() => {
        v.fooFunc = (frag, text) => {
          if (text === 'g') {
            frag.appendChild(v.div1 = Dom.h({div: 'Geoff Jacobsen', '$data-id': 'g1'}));
            frag.appendChild(v.div2 = Dom.h({div: 'Gordon Snow', '$data-id': 'g2'}));
            frag.appendChild(v.div3 = Dom.h({div: 'Gayle Gunter', '$data-id': 'g3'}));
          }
          if (text === 'jjg') {
            frag.appendChild(v.div2 = Dom.h({div: 'James J Gooding', '$data-id': 'j2'}));
            frag.appendChild(v.div3 = Dom.h({div: 'Josiah<JG>', '$data-id': 'j3'}));
          }
        };

        v.fooHtmlFunc = (elm, ctx) =>
          Dom.h({a: elm.textContent, class: 'foo', $href: '/#' + elm.getAttribute('data-id')});

        pressChar(v.inputCtx, '@');
        pressChar(v.inputCtx, 'g');
      });

      test('empty', () => {
        TH.input('input', 'jjg');
        assert.dom('.rtMention.inline>div:not(.empty)');
        TH.input('input', 'jjgx');
        assert.dom('.rtMention.inline>div.empty');

        assert.dom('input', (input) => {
          const updspy = spy(Dom.ctx(input), 'updateAllTags');
          const mdlspy = spy(Dom, 'reposition');

          TH.input(input, 'jjg');
          assert(updspy.calledBefore(mdlspy));
          assert.calledWith(
            mdlspy,
            'on',
            m((obj) =>
              obj.popup === input.parentNode && obj.origin === v.input.querySelector('.ln')
            ),
          );
        });
        assert.dom('.rtMention.inline>div:not(.empty)');
      });

      test('override', () => {
        v.fooHtmlFunc = (elm, ctx) => {
          v.fooHtmlFuncCtx = ctx;
        };

        const fooFuncOrig = v.fooFunc;

        v.fooFunc = (frag, text, ctx) => {
          assert.same(ctx.data.value, 'jjg');

          ctx.data.value = 'changed';
          return fooFuncOrig(frag, text, ctx);
        };

        assert.dom('.rtMention', function () {
          assert.dom('input', function () {
            this.focus();
            TH.input(this, 'jjg');
            assert.same(this.value, 'changed');
          });

          assert.dom('>div>div', 'James J Gooding', function () {
            Dom.stopEvent.reset();
            TH.trigger(this, 'pointerdown');
            assert.called(Dom.stopEvent);
            TH.trigger(this, 'pointerup');
          });
        });

        assert.dom('.rtMention div', 'James J Gooding', function () {
          assert.same(v.fooHtmlFuncCtx, Dom.ctx(this));
        });
      });

      test('input and click', () => {
        assert.dom('.rtMention', function () {
          assert.dom('>div>div', {count: 3});
          assert.dom('>div>div:first-child.selected', function () {
            assert.same(this, v.div1);
          });

          assert.dom('input', function () {
            TH.input(this, 'jjg');
          });

          assert.dom('>div>div', {count: 2});
          assert.dom('>div>div:first-child.selected', function () {
            assert.same(this, v.div2);
          });
          assert.dom('>div>div:last-child', function () {
            assert.same(this, v.div3);
            TH.pointerDownUp(this);
          });
        });

        refute.dom('.rtMention');

        assert.dom('.richTextEditor>.input', function () {
          assert.same(document.activeElement, this);
        });

        assert.dom(v.input, function () {
          refute.dom('.ln');
          assert.dom('a[href="/#j3"]', 'Josiah<JG>');
        });
      });

      test('click out aborts list', () => {
        assert.dom('.rtMention input', function () {
          TH.keydown(40);
        });

        assert.dom('.rtMention');

        TH.click('.glassPane');

        refute.dom('.rtMention');

        assert.dom('.input', function () {
          assert.same(this.innerHTML, 'hello @g');
        });
      });

      test('tab', () => {
        TH.trigger('input', 'keydown', {which: 9});

        assert.dom('.input', function () {
          assert.dom('a[href="/#g1"][class="foo"]');
          assert.same(
            this.innerHTML.replace(/&nbsp;/g, ' ').replace(/<a[^>]*>/, '<a>'),
            'hello <a>Geoff Jacobsen</a> ',
          );
        });
      });

      test('shift tab', () => {
        TH.trigger('input', 'keydown', {which: 9, shiftKey: true});

        refute.dom('.rtMention');

        assert.dom(v.input, function () {
          assert.same(this.innerHTML, 'hello @g');

          refute.dom('.ln');

          insert('w');
          assert.same(this.innerHTML, 'hello @wg');
        });
      });

      test('pointerover', () => {
        TH.trigger(v.div3, 'pointerover');
        assert.same(document.getElementsByClassName('selected').length, 1);
        assert.className(v.div3, 'selected');

        TH.trigger(v.div1, 'pointerover');
        assert.same(document.getElementsByClassName('selected').length, 1);
        assert.className(v.div1, 'selected');
      });

      test('disabled', () => {
        v.div2.classList.add('disabled');
        TH.trigger(v.div2, 'pointerover');

        refute.className(v.div2, 'selected');
        TH.pointerDownUp(v.div2);

        assert.dom('.rtMention');
      });

      test('key down, up, enter ', () => {
        assert.dom('.rtMention', function () {
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

            v.div2.classList.add('disabled');

            TH.trigger(this, 'keydown', {which: 40});
            refute.className(v.div1, 'selected');
            assert.className(v.div3, 'selected');

            TH.trigger(this, 'keydown', {which: 38});
            assert.className(v.div1, 'selected');
            refute.className(v.div3, 'selected');

            TH.trigger(this, 'keydown', {which: 40});
            TH.trigger(this, 'keydown', {which: 13});
          });
        });

        refute.dom('.rtMention');

        assert.dom(v.input, function () {
          refute.dom('.ln');
          assert.dom('a[href="/#g3"]', 'Gayle Gunter');
        });
      });
    });

    test('input box uses modal', () => {
      spy(Dom, 'reposition');
      assert.dom(v.input, (elm) => {
        pressChar(v.inputCtx, '@');
        pressChar(v.inputCtx, 'h');
      });

      const ln = document.getElementsByClassName('ln')[0];
      const unbb = ln.getBoundingClientRect();

      assert.dom('.glassPane>.rtMention', (elm) => {
        assert.calledWith(Dom.reposition, 'on', {
          popup: elm,
          origin: TH.match.field('tagName', 'SPAN'),
        });
        const minp = elm.querySelector('input');
        assert.dom('.empty', (popup) => {
          assert.calledWith(Dom.reposition, 'below', {popup, origin: minp});
        });
      });
    });

    group('keydown', () => {
      beforeEach(() => {
        pressChar(v.inputCtx, '@');
        pressChar(v.inputCtx, 'h');
      });

      test('deleting @', () => {
        assert.dom('.rtMention>input', (input) => {
          TH.input(input, '');
          TH.trigger(input, 'keydown', {which: 8});
        });

        assert.dom(v.input, (input) => {
          refute.dom('.ln');

          assert.same(input.innerHTML, 'hello&nbsp;');
          insert('w');
          assert.same(input.innerHTML, 'hello w');
        });
        refute.dom('.rtMention');
      });

      test('arrow left', () => {
        assert.dom('.rtMention>input', (input) => {
          TH.input(input, '');
          TH.trigger(input, 'keydown', {which: 37});
        });

        refute.dom('.rtMention');

        assert.dom(v.input, (input) => {
          refute.dom('.ln');

          assert.same(document.activeElement, input);

          insert('w');
          assert.same(input.innerHTML, 'hello w@');
        });
      });

      test('escape pressed', () => {
        TH.trigger('.rtMention>input', 'keydown', {which: 27});

        assert.dom(v.input, (input) => {
          assert.same(input.innerHTML, 'hello @h');

          refute.dom('.ln');

          insert('w');
          assert.same(input.innerHTML, 'hello @hw');
        });
      });
    });

    test('@ not after space', () => {
      pressChar(v.inputCtx, '.');
      pressChar(v.inputCtx, '@');
      pressChar(v.inputCtx, 'h');

      refute.dom('.rtMention');
    });

    test('.ln removed removes rtMention', () => {
      assert.dom(v.input, (input) => {
        pressChar(v.inputCtx, '@');
        const offset = v.inputCtx.mention.offset;
        pressChar(v.inputCtx, 'h');
        assert.dom('.ln', (ln) => {
          Dom.remove(ln);
        });
        moveRange(v.inputCtx, input.firstChild, offset);
      });

      refute.dom('.rtMention');
    });

    test('clear', () => {
      document.body.appendChild(
        RichTextEditorToolbar.$autoRender({content: document.createTextNode('hello')}),
      );

      assert.dom('.richTextEditor', (rte) => {
        pressChar(v.inputCtx, '@');
        pressChar(v.inputCtx, 'h');

        RichTextEditor.clear(rte);
        assert.dom('>.input', '');
      });

      refute.dom('.rtMention');
    });

    test('removing editor removes rtMention', () => {
      pressChar(v.inputCtx, '@');
      pressChar(v.inputCtx, 'h');

      assert.dom('.richTextEditor', (rte) => {
        Dom.remove(rte);
      });

      refute.dom('.rtMention');
    });

    test("a events don't propagate", () => {
      assert.dom(v.input, (input) => {
        input.appendChild(v.href = Dom.h({a: 'link'}));
        const event = TH.buildEvent('click');
        stub(event, 'preventDefault');
        TH.trigger(v.href, event);
        assert.called(event.preventDefault);
      });
    });

    test("button events don't propagate", () => {
      assert.dom(v.input, (input) => {
        input.appendChild(v.button = Dom.h({button: 'bang'}));
        const event = TH.buildEvent('click');
        stub(event, 'preventDefault');
        TH.trigger(v.button, event);
        assert.called(event.preventDefault);
      });
    });

    test('removing rtMention', () => {
      assert.dom(v.input, (input) => {
        pressChar(v.inputCtx, '@');
        pressChar(v.inputCtx, 'h');
        assert.isTrue(Dom.ctx(v.input).openDialog);
      });

      assert.dom('.glassPane', (gp) => {
        Dom.remove(gp);
      });

      assert.isFalse(Dom.ctx(v.input).openDialog);
      refute.dom('.ln');

      const ctx = Dom.ctx(v.input);
      assert.same(ctx.selectItem, null);
      assert.same(ctx.mention.elm, null);
    });
  });
});

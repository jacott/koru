isClient && define((require, exports, module)=>{
  'use strict';
  const Dom             = require('../dom');
  const Each            = require('./each');
  const TH              = require('./test-helper');

  const {stub, spy} = TH;

  const sut  = require('./select-menu');
  const $ = Dom.current;

  let v = {};

  TH.testCase(module, ({after, beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.TestTpl = Dom.newTemplate(module, require('koru/html!./select-menu-test'));

      document.body.appendChild(v.testSelectMenu = v.TestTpl.$autoRender({}));
      v.result = false;
      v.popup = function (customize, pos, range) {
        assert.dom('#TestSelectMenu [name=select]', function () {
          this.focus();
          sut.popup(this, {
            customize() {
              $.element.style.position = 'absolute';
              customize && customize.call(this);
            },
            list: [[1, 'One'], [2, 'Two']],
            onSelect(elm, event) {
              v.currentTarget = event.currentTarget;
              v.elm = elm;
              return v.result;
            }}, pos);
          v.button = this;
        });
      };
    });

    afterEach(()=>{
      TH.domTearDown();
      v = {};
    });

    group("closing", ()=>{
      beforeEach(()=>{
        v.onClose = stub();
        assert.dom('#TestSelectMenu [name=select]', function () {
          sut.popup(this, {
            onClose(ctx) {v.onClose(ctx)},
            onSelect() {return true},
          });
        });


      });

      test("direct focus", ()=>{
        const button = Dom.h({button: 'test'});
        document.body.appendChild(button);
        v.onClose = ctx => {ctx.focusElm = button};
        Dom.remove(Dom('.glassPane'));
        assert.same(document.activeElement, button);
      });

      test("onClose", ()=>{
        assert.dom('body>.glassPane', function () {
          Dom.remove(this);
        });
        assert.called(v.onClose);
      });

      test("closes if parent ctx closes", ()=>{
        Dom.remove(v.testSelectMenu);
        refute.dom('body>.glassPane');
        assert.called(v.onClose);
      });

    });

    test("restores range", ()=>{
      const html = Dom.h({div: "Hello world", '$contenteditable': true});
      document.body.appendChild(html);
      const input = Dom.h({input: ""});
      document.body.appendChild(input);
      html.focus();
      TH.setRange(html.firstChild, 3, html.firstChild, 5);
      sut.popup(html, {
        list: [["foo", "foo"]],
        search: sut.nameSearch,
        onSelect() {
          return true;
        },
      });
      document.activeElement.blur();
      assert.dom('.glassPane');
      TH.click('.glassPane li');
      assert.same(document.activeElement, html);
      const range = Dom.getRange();
      assert.same(range.startContainer, html.firstChild);
      assert.same(range.startOffset, 3);
      assert.same(range.endContainer, html.firstChild);
      assert.same(range.endOffset, 5);
      sut.popup(html, {
        list: [["foo", "foo"]],
        search: sut.nameSearch,
        onSelect() {
          input.focus();
          input.value = "foo";
          input.select();
          return true;
        },
      });

      TH.click('.glassPane li');

      assert.same(document.activeElement, input);
      assert.same(input.selectionEnd, 3);
    });

    test("decorator", ()=>{
      assert.dom('#TestSelectMenu [name=select]', function () {
        v.button = this;
      });
      sut.popup(v.button, {
        list: v.list = [[1, 'One'], [2, 'Two']],
        decorator: v.decorator = stub(),
      });

      assert.calledWith(v.decorator, TH.match(arg => arg._id === 1),
                        TH.match(arg => arg.textContent === 'One'));

      assert.calledWith(v.decorator, TH.match(arg => arg._id === 2),
                        TH.match(arg => arg.textContent === 'Two'));
    });

    test("class lines", ()=>{
       assert.dom('#TestSelectMenu [name=select]', function () {
        v.button = this;
      });
      sut.popup(v.button, {
        list: v.list = [[1, 'One'], 'sep me', [2, 'Two'], {id: 3, name: 'Three', parent: {class: 'foo', 'data-id': 'fuzz'}}],
      });

      assert.dom('.glassPane', function () {
        assert.dom('li.sep.me');
        assert.dom('li.foo[data-id=fuzz]', 'Three');
      });
    });

    test("selected array data", ()=>{
      assert.dom('#TestSelectMenu [name=select]', function () {
        v.button = this;
      });

      sut.popup(v.button, {
        list: [[1, 'One'], [0, 'Zero']],
        selected: 0,
        onSelect(elm, event) {
        },
      });

      assert.dom('body>.glassPane', function () {
        assert.dom('.selected', {data:TH.match.field('_id', 0)});
      });
    });

    test("selected object data", ()=>{
      assert.dom('#TestSelectMenu [name=select]', function () {
        v.button = this;
      });

      sut.popup(v.button, {
        list: [{_id: 1, name: 'One'}, {_id: 2, name: 'Two'}],
        selected: 2,
        onSelect(elm, event) {
        },
      });

      assert.dom('body>.glassPane', function () {
        assert.dom('.selected', {count: 1});
        assert.dom('.selected', {data:TH.match.field('_id', 2)});
      });
    });

    test("multi select", ()=>{
      assert.dom('#TestSelectMenu [name=select]', function () {
        v.button = this;
      });

      sut.popup(v.button, {
        list: [{_id: 1, name: 'One'}, {_id: 2, name: 'Two'}, {_id: 3, name: 'Three'}],
        selected: [3, 2],
        onSelect(elm, event) {
        },
      });

      assert.dom('body>.glassPane', function () {
        assert.dom('.selected', {count: 2});
        assert.dom('.selected', {data:TH.match.field('_id', 2)});
        assert.dom('.selected', {data:TH.match.field('_id', 3)});
      });
    });

    test("nameSearch", ()=>{
      assert.same(sut.nameSearch(/foo/, {name: 'a foo'}), true);
      assert.same(sut.nameSearch(/foo/, {name: 'a fuz'}), false);
    });

    test("noFocus", ()=>{
      assert.dom('#TestSelectMenu [name=select]', function () {
        v.searchStub = stub();
        this.focus();
        sut.popup(this, {
          noFocus: true,
          search() {},
          list: [[1, 'One'], [2, 'Two']],
          onSelect(elm, event) {
            return true;
          },
        });
      });
      assert.dom('body>.glassPane>#SelectMenu', function () {
        assert.dom('input[name=search][autocomplete=off]', function () {
          refute.same(document.activeElement, this);
        });
      });
    });

    test("search", ()=>{
      assert.dom('#TestSelectMenu [name=select]', function () {
        v.searchStub = stub();
        this.focus();
        sut.popup(this, {
          search(reg, data) {
            v.searchStub();
            return reg.test(data.name);
          },
          searchDone: v.searchDone = stub(),
          rendered: v.rendered = stub(),
          list: [[1, 'One'], [2, 'Two'], [3, 'Three']],
          onSelect(elm, event) {
            v.elm = elm;
            v.which = event.which;
            return true;
          },
        });
        v.button = this;
      });
      assert.dom('body>.glassPane>#SelectMenu', function () {
        v.selectMenuELm = this;
        assert.dom('input[name=search][autocomplete=off]', function () {
          assert.same(document.activeElement, this);

          v.search = this;
          v.search.addEventListener('keydown', v.inputel = stub());
          after(()=>{v.search.removeEventListener('keydown', v.inputel)});
          TH.input(v.search, 'one');
          const ev = keydown(101 /* e */);
          assert.called(v.inputel);
          assert.called(ev.stopImmediatePropagation);
          refute.called(ev.preventDefault);
          assert.calledOnceWith(v.searchDone, this, v.selectMenuELm);
          assert(v.searchDone.calledAfter(v.searchStub));
        });
        assert.calledOnceWith(v.rendered, this);
        assert.dom('li.hide', {count: 2});
        assert.dom('li:not(.hide)', 'One', function () {
          Dom.addClass(v.one = this, 'selected');
        });
        TH.input(v.search, 't');
        assert.dom('li.hide', {count: 1, text: 'One'});
        TH.trigger(v.search, 'keydown', {which: 13});
        spy(Dom, 'ensureInView');
        let ev = keydown(40);
        assert.called(ev.stopImmediatePropagation);
        assert.called(ev.preventDefault);
        assert.dom('li.selected', 'Two', elm =>{
          assert.calledWith(Dom.ensureInView, elm);
        });
        assert.dom('li:not(.selected)', 'One');
        TH.trigger(v.search, 'keydown', {which: 40});
        assert.dom('li.selected', 'Three');
        assert.dom('li:not(.selected)', 'Two');
        TH.trigger(v.search, 'keydown', {which: 40});
        assert.dom('li.selected', 'Three');
        TH.trigger(v.search, 'keydown', {which: 38});
        assert.dom('li.selected', 'Two');
        assert.dom('li:not(.selected)', 'One');
        TH.trigger(v.search, 'keydown', {which: 38});
        assert.dom('li.selected', 'Two');
        ev = keydown(13);
        assert.called(ev.stopImmediatePropagation);
        assert.called(ev.preventDefault);
      });
      assert.same(v.elm.textContent, 'Two');
      refute.dom('glassPane');
      assert.same(document.activeElement, document.querySelector('#TestSelectMenu [name=select]'));

      function keydown(keycode) {
        const ev = TH.buildEvent('keydown', {which: keycode});
        spy(ev, 'stopImmediatePropagation');
        spy(ev, 'preventDefault');
        TH.trigger(v.search, ev);
        return ev;
      }
    });

    group("position", ()=>{
      test("default", ()=>{
        v.popup();
        assert.dom('body>.glassPane>#SelectMenu', function () {
          const bbox = v.button.getBoundingClientRect();
          assert.cssNear(this, 'top', bbox.top + bbox.height, 2, 'px');
          assert.cssNear(this, 'left', bbox.left, 2, 'px');
        });
      });

      test("above", ()=>{
        v.testSelectMenu.style.position = 'absolute';
        v.testSelectMenu.style.bottom = '250px';
        v.popup(null, 'above');
        assert.dom('body>.glassPane>#SelectMenu', function () {
          const bbox = v.button.getBoundingClientRect();
          assert.same(this.style.top, '');
          assert.cssNear(this, 'bottom', window.innerHeight - bbox.top, 2, 'px');
          assert.cssNear(this, 'left', bbox.left, 2, 'px');
        });
      });

      test("full height", ()=>{
        v.popup(function () {
          $.element.style.height = (window.innerHeight + 200)+'px';
        });
        assert.dom('#SelectMenu', function () {
          const bbox = v.button.getBoundingClientRect();
          assert.cssNear(this, 'top', 0);
          assert.cssNear(this, 'left', bbox.left, 2, 'px');
        });
      });

      test("no room below", ()=>{
        assert.dom('#TestSelectMenu [name=select]', function () {
          this.style.position = 'absolute';
          this.style.top = (window.innerHeight * .75)+'px';
        });
        v.popup(function () {
          $.element.style.height = (window.innerHeight * .5)+'px';
        });
        assert.dom('#SelectMenu', function () {
          const bbox = v.button.getBoundingClientRect();
          assert.same(this.style.top, '');
          assert.cssNear(this, 'bottom', (window.innerHeight - bbox.top), 2, 'px');
          assert.cssNear(this, 'left', bbox.left, 2, 'px');
        });
      });

      test("no room above", ()=>{
        v.popup(function () {
          $.element.style.height = (window.innerHeight * .2)+'px';
        }, 'above');
        assert.dom('#SelectMenu', function () {
          const bbox = v.button.getBoundingClientRect();
          assert.same(this.style.bottom, '');
          assert.cssNear(this, 'top', (bbox.top + bbox.height), 2, 'px');
        });
      });
    });

    group("when open", ()=>{
      beforeEach(()=>{
        v.popup();
      });

      test("content", ()=>{
        assert.dom('#SelectMenu ul.ui-ul', function () {
          refute.dom('input');
          assert.dom('li[touch-action=auto]', 'One');
          assert.dom('li', 'Two');
        });
      });

      test("select drag release", ()=>{
        assert.dom('#SelectMenu>ul', ul=>{
          assert.dom('li:first-child', li =>{
            TH.trigger(li, 'pointermove', {clientX: 50, clientY: 150});
            TH.trigger(li, 'pointermove', {clientX: 57, clientY: 141});
            TH.trigger(li, 'pointerup');
            assert.same(v.elm, li);
          });
        });
      });

      test("select small-drag release", ()=>{
        assert.dom('#SelectMenu>ul', ul=>{
          assert.dom('li:first-child', li =>{
            TH.trigger(li, 'pointermove', {clientX: 50, clientY: 150});
            TH.trigger(li, 'pointermove', {clientX: 57, clientY: 143});
            TH.trigger(li, 'pointerup');
            refute.same(v.elm, li);
          });
        });
      });

      test("select no-drag release", ()=>{
        assert.dom('#SelectMenu>ul', ul=>{
          assert.dom('li:first-child', li =>{
            TH.trigger(li, 'pointerup');
            refute.same(v.elm, li);
          });
        });
      });

      test("select by pointer", ()=>{
        assert.dom('#SelectMenu>ul', ul=>{
          assert.dom('li:first-child', li =>{
            spy(Dom, 'stopEvent');
            TH.click(li);
            assert.called(Dom.stopEvent);
            assert.same(v.elm, li);
            assert.same(v.currentTarget, ul);
            v.elm = undefined;
            TH.trigger(li, 'pointerdown');
            TH.trigger(li, 'pointerup');
            assert.same(v.elm, undefined);

          });

        });
        assert.dom('#SelectMenu');
        TH.trigger(document.body, 'pointerdown');
        assert.dom('#SelectMenu');
        TH.trigger('body>.glassPane', 'pointerdown');
        refute.dom('#SelectMenu');
      });

      test("pointercancel", ()=>{
        assert.dom(document.body, function () {
          assert.dom('#SelectMenu>ul', function () {
            assert.dom('li:first-child', function () {
              spy(Dom, 'stopEvent');
              TH.trigger(this, 'pointerdown');
              TH.trigger(this, 'pointercancel');
              TH.trigger(this, 'pointerup');
              refute.called(Dom.stopEvent);
              assert.same(v.elm, undefined);
            });

          });
          assert.dom('#SelectMenu');
        });
      });

      test("autoClose", ()=>{
        document.activeElement.blur();
        assert.dom(document.body, function () {
          assert.dom('#SelectMenu>ul', function () {
            assert.dom('li:first-child', function () {
              v.result = true;
              TH.click(this);
              assert.same(v.elm, this);
            });
          });
          refute.dom('#SelectMenu');
        });
        assert.same(document.activeElement, document.querySelector('#TestSelectMenu [name=select]'));
      });

      test("tab closes list", ()=>{
        assert.dom(document.body, function () {
          assert.dom('#SelectMenu>ul', function () {
            assert.dom('li:first-child', function () {
              TH.trigger(this, 'keydown', {which: 9});
            });
          });
          refute.dom('#SelectMenu');
        });
      });

      test("escape closes list", ()=>{
        document.activeElement.blur();
        assert.dom(document.body, function () {
          assert.dom('#SelectMenu>ul', function () {
            assert.dom('li:first-child', function () {
              TH.trigger(this, 'keydown', {which: 27});
            });
          });
          refute.dom('#SelectMenu');
        });
        assert.same(document.activeElement, document.querySelector('#TestSelectMenu [name=select]'));
      });

      test("clicking off list closes list", ()=>{
        assert.dom('#TestSelectMenu>br');
        TH.trigger('body>.glassPane', 'pointerdown');
        refute.dom('#SelectMenu');
      });

      test("can't select disabled", ()=>{
        assert.dom(document.body, function () {
          assert.dom('#SelectMenu>ul', function () {
            assert.dom('li:first-child', function () {
              Dom.addClass(this, 'disabled');
              TH.click(this);
              assert.same(v.elm, undefined);
              TH.keydown(40);
              TH.keydown(38);
              TH.keydown(this, 13);
              refute.className(v.elm, 'disabled');
            });
          });
          assert.dom('#SelectMenu');
        });
      });
    });

  });
});

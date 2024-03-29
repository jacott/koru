isClient && define((require, exports, module) => {
  'use strict';
  /**
   * Template is used to create interactive [Dom Trees](#mdn:/API/Node)
   **/
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const Ctx             = require('koru/dom/ctx');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const util            = require('koru/util');

  const Module = module.constructor;

  const {stub, spy, match} = TH;

  const {ctx$} = require('koru/symbols');

  const Template = require('./template');

  let v = {};

  TH.testCase(module, ({after, beforeEach, afterEach, group, test}) => {
    afterEach(() => {
      delete Dom.tpl.Foo;
      Dom.removeChildren(document.body);
      v = {};
    });

    test('stopEvent', () => {
      const ev = {stopImmediatePropagation: stub(), preventDefault: stub()};
      Dom.stopEvent(ev);
      assert.called(ev.stopImmediatePropagation);
      assert.called(ev.preventDefault);
      const Tpl = Dom.newTemplate({
        name: 'Foo',
        nodes: [{
          name: 'div',
        }],
      });

      Tpl.$events({
        'click'(event) {
          assert.same(Dom.event, event);
          Dom.stopEvent(event);
          refute.called(event.stopImmediatePropagation);
          refute.called(event.preventDefault);
          assert.same(Dom.event, null);
          v.success = true;
        },

        'keydown'(event) {
          assert.same(Dom.event, event);
          Dom.stopEvent();
          refute.called(event.stopImmediatePropagation);
          refute.called(event.preventDefault);
          assert.same(Dom.event, null);
          v.success = true;
        },
      });

      document.body.appendChild(Tpl.$autoRender({}));
      assert.dom('div', function () {
        const ctx = Dom.ctx(this);
        assert.same(ctx.element(), this);

        let ev = Dom.buildEvent('click');
        stub(ev, 'stopImmediatePropagation');
        stub(ev, 'preventDefault');
        this.dispatchEvent(ev);
        assert.called(ev.stopImmediatePropagation);
        assert.called(ev.preventDefault);
        assert(v.success);

        v.success = false;

        ev = Dom.buildEvent('keydown');
        stub(ev, 'stopImmediatePropagation');
        stub(ev, 'preventDefault');
        this.dispatchEvent(ev);
        assert.called(ev.stopImmediatePropagation);
        assert.called(ev.preventDefault);
        assert(v.success);
      });
    });

    test('relative name', () => {
      Dom.newTemplate({
        name: 'Bar.Baz.Buzz',
        nodes: [{
          name: 'div',
          children: [' ', ['>', ['.', '../../Fnord', ['Sub', 'Sub']], ['=', 'x', 123]]],
        }],
      });

      Dom.newTemplate({
        name: 'Bar.Fnord.Sub.Sub',
        nodes: [{
          name: 'div',
          children: ['hello Fnord'],
        }],
      });

      assert.dom(Dom.tpl.Bar.Baz.Buzz.$render({}), function () {
        assert.dom('div', 'hello Fnord');
      });
    });

    test('partial with helper data', () => {
      Dom.newTemplate({
        name: 'Bar.Parent',
        nodes: [{
          name: 'div',
          children: [' ', ['>', ['.', '/Bar', ['Child']], ['fooHelper']]],
        }],
      });

      Dom.newTemplate({
        name: 'Bar.Child',
        nodes: [{
          name: 'p',
          children: ['', ['', 'value1']],
        }],
      });

      Dom.tpl.Bar.Parent.$helpers({
        fooHelper() {
          return this.child;
        },
      });

      assert.dom(Dom.tpl.Bar.Parent.$render({child: {value1() {return 'Success'}}}), function () {
        assert.dom('div>p', 'Success');
      });
    });

    group('partial', () => {
      beforeEach(() => {
        Dom.newTemplate({
          name: 'Foo',
          nodes: [{
            name: 'section',
            attrs: [['=', 'id', 'FooId']],
            children: [' ', ['>', '/Bar']],
          }],
        });

        Dom.newTemplate({
          name: 'Bar',
          nodes: [{
            name: 'div',
            children: [' ', ['>', 'Baz', [['=', 'initials', 'myFunc']]]],
          }],
        });

        Dom.newTemplate({
          name: 'Bar.Baz',
          nodes: [{
            name: 'input',
            attrs: [['=', 'type', 'text'], ['=', 'value', ['', 'initials']]],
            children: [{
              name: 'article',
              attrs: [['=', 'id', 'BazArticle']],
            }],
          }],
        });
      });

      afterEach(() => {
        Dom.removeChildren(document.body);
        delete Dom.tpl.Bar;
      });

      test('setCtx', () => {
        const elm = Dom.tpl.Foo.$render({});
        assert.dom(elm, function () {
          v.pCtx = Dom.myCtx(this);
          this.appendChild(Dom.h({class: 'ins'}));
          assert.dom('.ins', function () {
            v.iCtx = Dom.setCtx(this);
            assert.same(v.iCtx.parentCtx, v.pCtx);
            assert.same(Dom.myCtx(this), v.iCtx);
            v.nCtx = Dom.setCtx(this, new Dom.Ctx());
            assert.same(v.nCtx.parentCtx, undefined);
            assert.same(Dom.myCtx(this), v.nCtx);
          });
        });
      });

      test('find ctx', () => {
        Dom.tpl.Bar.$helpers({
          myFunc() {
            v.helperFoundCtx = Dom.tpl.Foo.$ctx();

            return 'one';
          },
        });
        const elm = Dom.tpl.Foo.$render({});

        assert.same(v.helperFoundCtx, elm[ctx$]);

        assert.dom(elm, function () {
          assert.dom('input', {value: 'one'}, function () {
            const ctx = Dom.tpl.Foo.$ctx(this);
            assert.same(ctx, elm[ctx$]);
            assert.same(ctx.element(), elm);
          });
        });

        document.body.appendChild(elm);

        assert.dom('#FooId');
        assert.same(Dom.tpl.Foo.$ctx('FooId'), elm[ctx$]);
        assert.same(Dom.tpl.Foo.$data('FooId'), elm[ctx$].data);
        assert.same(Dom.tpl.Foo.$data(elm.querySelector('#BazArticle')), elm[ctx$].data);

        assert.same(Dom.ctxById('FooId'), elm[ctx$]);
      });

      test('updateAllTags', () => {
        const elm = Dom.tpl.Foo.$render({myFunc: 'one'});

        document.body.appendChild(elm);

        assert.dom(elm, function () {
          assert.dom('input', {value: 'one'});

          elm[ctx$].updateAllTags({myFunc: 'two'});

          assert.dom('input', {count: 1});
          assert.dom('input', {value: 'two'}, function () {
            this[ctx$].updateAllTags(null);

            assert.same(this.textContent, '');

            assert.same(this[ctx$].data, null);
          });
        });
      });

      test('restoring focus', () => {
        Dom.tpl.Bar.$helpers({
          myFunc() {
            v.helperFoundCtx = Dom.tpl.Foo.$ctx();

            document.activeElement.blur(); // same effect as moving the focused element
            return 'foo';
          },
        });
        const elm = Dom.tpl.Foo.$render({});

        document.body.appendChild(elm);

        assert.dom(elm, function () {
          assert.dom('input', function () {
            this.focus();
            assert.same(document.activeElement, this);
          });

          elm[ctx$].updateAllTags();

          assert.dom('input', function () {
            assert.same(document.activeElement, this);

            this[ctx$].updateAllTags(null);

            assert.same(this.textContent, '');

            assert.same(this[ctx$].data, null);
          });
        });
      });

      test('default arg is data', () => {
        Dom.tpl.Bar.$created = stub();

        const data = {arg: 'me'};
        Dom.tpl.Foo.$render(data);

        assert.calledWith(Dom.tpl.Bar.$created, match(
          (ctx) => (assert.same(ctx.data, data), true)));
      });

      test('scoping', () => {
        const initials = 'BJ';
        Dom.tpl.Bar.$helpers({
          myFunc() {
            return initials;
          },
        });
        const result = Dom.tpl.Foo.$render({});

        assert.dom(result, function () {
          assert.dom('>div>input', {value: 'BJ'});
        });
      });
    });

    test('$actions', () => {
      Dom.newTemplate({name: 'Foo'});
      Dom.tpl.Foo.$actions({
        one: v.one = stub(),
        two: stub(),
      });

      assert.same(Dom.tpl.Foo._events.length, 2);
      assert.same(Dom.tpl.Foo._events[0][0], 'click');
      assert.same(Dom.tpl.Foo._events[0][1], '[name=one]');

      const event = {};

      Dom.tpl.Foo._events[0][2](event);

      assert.calledWithExactly(v.one, event);
    });

    test('focus events', () => {
      /**
       * ensure focus and blur are capture events.

       * blur and focusout should not fire if document.activeElement === event.target
       **/
      Dom.newTemplate({name: 'Foo', nodes: [{
        name: 'div', children: [
          {name: 'button'},
        ],
      }]});
      Dom.tpl.Foo.$events({
        'focus button': v.focus = stub(),
        'blur button': v.blur = stub(),
        'focusout button': v.focusout = stub(),
      });

      const foo = Dom.tpl.Foo.$render({});

      stub(foo, 'addEventListener');
      Dom.tpl.Foo.$attachEvents(foo);

      assert.calledWith(foo.addEventListener, 'focus', match((f) => v.f = f), true);
      assert.calledWith(foo.addEventListener, 'blur', match((f) => v.b = f), true);
      assert.calledWithExactly(foo.addEventListener, 'focusout', v.b);

      v.f(v.ev = {type: 'focus', currentTarget: foo, target: foo.querySelector('button')});
      assert.calledWith(v.focus, v.ev);

      v.b(v.ev = {type: 'blur', currentTarget: foo, target: document.activeElement});
      refute.called(v.blur);
      v.b(v.ev = {type: 'blur', currentTarget: foo, target: foo.querySelector('button')});
      assert.calledWith(v.blur, v.ev);

      v.b(v.ev = {type: 'focusout', currentTarget: foo, target: document.activeElement});
      refute.called(v.focusout);
      v.b(v.ev = {type: 'focusout', currentTarget: foo, target: foo.querySelector('button')});
      assert.calledWith(v.focusout, v.ev);

      stub(foo, 'removeEventListener');
      Dom.tpl.Foo.$detachEvents(foo);

      assert.calledWith(foo.removeEventListener, 'focus', v.f, true);
      assert.calledWith(foo.removeEventListener, 'blur', v.b, true);
      assert.calledWithExactly(foo.removeEventListener, 'focusout', v.b);
    });

    group('menustart', () => {
      beforeEach(() => {
        Dom.newTemplate({name: 'Foo', nodes: [{
          name: 'div', children: [
            {name: 'button'},
          ],
        }]});
        Dom.tpl.Foo.$events({
          'menustart button': v.menustart = stub(),
        });

        v.foo = Dom.tpl.Foo.$render({});
        document.body.append(v.foo);

        spy(v.foo, 'addEventListener');
        Dom.tpl.Foo.$attachEvents(v.foo);
        v.target = v.foo.querySelector('button');
        v.ev = {
          target: v.target,
          currentTarget: v.foo,
        };
      });

      test('non touch pointerdown', () => {
        Dom.triggerEvent(v.target, 'pointerdown');
        assert.calledWith(v.menustart, match((ev) => ev.type === 'pointerdown'));
      });

      test('touch click', () => {
        Dom.triggerEvent(v.target, 'pointerdown', {pointerType: 'touch'});

        refute.called(v.menustart);
        Dom.triggerEvent(v.target, 'click');

        assert.calledWith(v.menustart, match((ev) => ev.type === 'click'));
      });

      test('$detachEvents', () => {
        assert.calledWithExactly(v.foo.addEventListener, 'pointerdown', match(
          (f) => v.pointerdown = f));
        spy(v.foo, 'removeEventListener');
        Dom.tpl.Foo.$detachEvents(v.foo);

        assert.calledWithExactly(v.foo.removeEventListener, 'pointerdown', v.pointerdown);
      });
    });

    group('dragstart on touch', () => {
      beforeEach(() => {
        Dom.newTemplate({name: 'Foo', nodes: [{
          name: 'div', children: [
            {name: 'span', attrs: [['=', 'draggable', 'true']]},
          ],
        }]});
        Dom.tpl.Foo.$events({
          'dragstart span': v.dragStart = stub(),
        });

        v.foo = Dom.tpl.Foo.$render({});
        document.body.append(v.foo);

        stub(v.foo, 'addEventListener');
        Dom.tpl.Foo.$attachEvents(v.foo);
        assert.calledWithExactly(v.foo.addEventListener, 'dragstart', match.func);
        assert.calledWithExactly(v.foo.addEventListener, 'touchstart', match(
          (f) => v.touchstart = f));

        stub(koru, 'setTimeout').returns(321);
        stub(koru, 'clearTimeout');
        v.target = v.foo.querySelector('span');
        stub(document, 'addEventListener');
        v.touchstartEvent = {
          type: 'touchstart', currentTarget: v.foo,
          target: v.target,
          touches: [{clientX: 30, clientY: 60}],
        };
        v.start = () => {
          v.touchstart(v.touchstartEvent);

          assert.calledWith(document.addEventListener, 'touchend', match((f) => v.touchend = f),
                            Dom.captureEventOption);

          assert.calledWith(document.addEventListener, 'touchmove', match((f) => v.touchmove = f),
                            Dom.captureEventOption);
        };
      });

      test('touch and hold', () => {
        v.start();

        assert.calledWith(koru.setTimeout, match.func, 300);

        koru.setTimeout.reset();
        stub(document, 'removeEventListener');
        v.touchstart(v.ev = {
          type: 'touchstart', currentTarget: v.foo,
          target: v.target,
          touches: [{clientX: 30, clientY: 60}, {clientX: 30, clientY: 60}],
        });

        assert.calledWith(koru.clearTimeout, 321);
        refute.called(koru.setTimeout);
        assert.calledWith(document.removeEventListener, 'touchend', v.touchend,
                          Dom.captureEventOption);
        assert.calledWith(document.removeEventListener, 'touchmove', v.touchmove,
                          Dom.captureEventOption);

        v.touchstart(v.touchstartEvent);

        assert.calledWith(koru.setTimeout, match((to) => v.to = to), 300);
        refute.called(v.dragStart);
        stub(Dom, 'triggerEvent');
        v.to();
        assert.calledWith(Dom.triggerEvent, v.target, 'dragstart', {clientX: 30, clientY: 60});

        stub(v.foo, 'removeEventListener');
        Dom.tpl.Foo.$detachEvents(v.foo);

        assert.calledWithExactly(v.foo.removeEventListener, 'dragstart', match.func);
        assert.calledWithExactly(v.foo.removeEventListener, 'touchstart', v.touchstart);
      });

      test('move cancels', () => {
        v.start();

        refute.called(koru.clearTimeout);

        stub(document, 'removeEventListener');

        v.touchmove({touches: [{clientX: 35, clientY: 60}]});

        assert.calledWithExactly(koru.clearTimeout, 321);
        assert.calledTwice(document.removeEventListener);
      });

      test('end cancels', () => {
        v.start();

        refute.called(koru.clearTimeout);

        stub(document, 'removeEventListener');

        v.touchend({touches: [{clientX: 35, clientY: 60}]});

        refute.called(koru.clearTimeout);
        refute.called(document.removeEventListener);

        v.touchend({touches: []});

        assert.calledWithExactly(koru.clearTimeout, 321);
        assert.calledTwice(document.removeEventListener);
      });

      test('dragging', () => {
        v.start();

        koru.setTimeout.yield();

        stub(Dom, 'triggerEvent');
        v.touchmove(v.ev = {
          target: v.target,
          touches: [{clientX: 35, clientY: 60}],
          preventDefault: stub(),
          stopImmediatePropagation: stub(),
        });

        assert.calledWith(Dom.triggerEvent, v.target, 'pointermove', {clientX: 35, clientY: 60});
        assert.called(v.ev.preventDefault);
        assert.called(v.ev.stopImmediatePropagation);

        stub(document, 'removeEventListener');
        v.touchend({target: v.target,
                    touches: []});

        assert.calledWith(Dom.triggerEvent, v.target, 'pointerup', {clientX: 35, clientY: 60});

        assert.calledTwice(document.removeEventListener);
      });
    });

    test('event calling', () => {
      Dom.newTemplate({name: 'Foo', nodes: [{
        name: 'div', children: [
          {name: 'span'},
          {name: 'button'},
        ],
      }]});
      v.spanCall = stub();
      Dom.tpl.Foo.$events({
        'click div': v.divCall = stub(),

        'click span'(event) {
          v.spanCall();
          v.stop && Dom[v.stop].call(Dom);
        },
      });
      Dom.tpl.Foo.$event('click button', v.buttonCall = stub());

      document.body.appendChild(Dom.tpl.Foo.$render({}));

      assert.dom('body>div', function () {
        const top = this;
        after(() => {Dom.remove(top)});
        spy(top, 'addEventListener');
        Dom.tpl.Foo.$attachEvents(top);
        assert.calledOnce(top.addEventListener);
        Dom.ctx(top).onDestroy(function () {
          Dom.tpl.Foo.$detachEvents(top);
        });
        assert.dom('span', function () {
          top.addEventListener.yield({
            currentTarget: top, target: this, type: 'click',
            stopImmediatePropagation: v.sip = stub(),
            preventDefault: v.pd = stub(),
          });
        });
        assert.called(v.spanCall);
        assert.called(v.divCall);
        refute.called(v.sip);
        refute.called(v.pd);

        // stopEvent
        v.spanCall.reset(); v.divCall.reset();
        v.stop = 'stopEvent';

        assert.dom('span', function () {
          top.addEventListener.yield({
            currentTarget: top, target: this, type: 'click',
            stopImmediatePropagation: v.sip = stub(),
            preventDefault: v.pd = stub(),
          });
        });
        assert.called(v.spanCall);
        refute.called(v.divCall);
        assert.called(v.sip);
        assert.called(v.pd);

        // stopPropigation
        v.spanCall.reset(); v.divCall.reset();
        v.stop = 'stopPropigation';

        assert.dom('span', function () {
          top.addEventListener.yield({
            currentTarget: top, target: this, type: 'click',
            stopImmediatePropagation: v.sip = stub(),
            preventDefault: v.pd = stub(),
          });
        });
        assert.called(v.spanCall);
        refute.called(v.divCall);
        assert.called(v.sip);
        refute.called(v.pd);

        Dom.tpl.Foo.$detachEvents(top);
        Dom.remove(top);
        Dom.tpl.Foo.$detachEvents(top);
      });
    });

    test('addTemplates', () => {
      /**
       * Add nested templates to parent. This is automatically called but is exposed so that it can
       * be overwritten in a sub class.
       */
      api.method();
      //[
      const Tpl = new Template('MyTemplate');
      Template.addTemplates(Tpl, {
        name: 'Sub1', nodes: ['sub 1'],
        nested: [{name: 'Sub', nodes: ['sub 1 sub']}]});
      assert.same(Tpl.Sub1.Sub.$render({}).textContent, 'sub 1 sub');
      //]
    });

    group('newTemplate', () => {
      beforeEach(() => {});

      test('simple', () => {
        /**
         * Create a new `Template` from an html blueprint.
         *
         * @param [module] if supplied the template will be deleted if
         * `module` is unloaded
         *
         * @param blueprint A blue print is usually built by
         * {#koru/dom/template-compiler} which is called automatically
         * on html files loaded using
         * `require('koru/html!path/to/my-template.html')`
         **/
        api.method('newTemplate');
        const myMod = {id: 'myMod', onUnload: stub(),
                       __proto__: Module.prototype};
        assert.same(Template.newTemplate(myMod, {
          name: 'Foo', nodes: [{name: 'div'}],
        }), Dom.tpl.Foo);

        const tpl = Dom.tpl.Foo;
        assert.same(tpl.name, 'Foo');
        assert.equals(tpl.nodes, [{name: 'div'}]);
        assert.equals(tpl._events, []);

        myMod.onUnload.yield();
        refute(Dom.tpl.Foo);
      });

      test('not found', () => {
        const tp = Dom.newTemplate({name: 'Foo.Bar.Baz'});
        assert.same(Dom.lookupTemplate('Foo.Fizz.Bar'), undefined);
      });

      test('lookupTemplate', () => {
        const foo = Dom.newTemplate({name: 'Foo'});
        const baz = Dom.newTemplate({name: 'Foo.Bar.Baz'});
        const bob = Dom.newTemplate({name: 'Foo.Bar.Bob'});
        assert.same(Template.lookupTemplate(baz, '.'), baz);
        assert.same(Template.lookupTemplate(baz, '..'), baz.parent);
        assert.same(Template.lookupTemplate(baz, '../..'), baz.parent.parent);
        assert.same(Template.lookupTemplate(baz, '../../.'), baz.parent.parent);
        assert.same(Template.lookupTemplate(baz, '../Bob'), bob);
        assert.same(Template.lookupTemplate(baz.parent, 'Bob'), bob);
        assert.same(Template.lookupTemplate(foo, 'Bar.Bob'), bob);
        assert.same(Template.lookupTemplate(foo, '/Foo.Bar.Bob'), bob);
      });

      test('nest by name', () => {
        const fbb = Dom.newTemplate({name: 'Foo.Bar.Baz'});
        const fff = Dom.newTemplate({name: 'Foo.Fnord.Fuzz'});

        assert.same(fbb, Dom.lookupTemplate('Foo.Bar.Baz'));
        assert.same(fbb, Template.lookupTemplate(Dom.lookupTemplate('Foo'), 'Bar.Baz'));
        assert.same(fff, Template.lookupTemplate(fbb, '../../Fnord.Fuzz'));

        const tpl = Dom.tpl.Foo.Bar;
        assert.same(tpl.name, 'Bar');
        assert.same(Dom.lookupTemplate('Foo.Bar'), tpl);

        assert.same(tpl.Baz.name, 'Baz');

        Dom.newTemplate({name: 'Foo'});

        assert.same(Dom.tpl.Foo.name, 'Foo');
        assert.same(Dom.tpl.Foo.Bar.Baz.name, 'Baz');

        Dom.newTemplate({name: 'Foo.Bar'});

        assert.same(Dom.tpl.Foo.Bar.name, 'Bar');
        assert.same(Dom.tpl.Foo.Bar.Baz.name, 'Baz');
      });
    });

    group('with template', () => {
      beforeEach(() => {
        Dom.newTemplate({
          name: 'Foo',
          nodes: [{name: 'div', attrs: [['=', 'id', 'foo'], ['', 'myHelper']]}],
        });
      });

      test('$created', () => {
        const pCtx = {foo: 'bar'};
        Dom.tpl.Foo.$extend({
          $created(ctx, elm) {
            v.ctx = ctx;
            assert.same(ctx.parentCtx, pCtx);

            v.elm = elm;
            ctx.data = {myHelper: v.myHelper = stub()};
          },
        });

        assert.dom(Dom.tpl.Foo.$render({}, pCtx), function () {
          assert.called(v.myHelper);
          assert.same(v.elm, this);
          assert.same(v.ctx, Dom.ctx(this));
        });
      });

      test('updateAllTags called only if data', () => {
        const myHelper = stub();
        Dom.tpl.Foo.$helpers({
          myHelper,
        });

        Dom.tpl.Foo.$render();
        Dom.tpl.Foo.$render(null);
        refute.called(myHelper);

        const data = {foo: 1};
        Dom.tpl.Foo.$render(data);
        assert.calledOnce(myHelper);
        assert.same(myHelper.firstCall.thisValue, data);
      });

      test('setBoolean', () => {
        refute.exception(() => {Dom.setBoolean('disabled', true)});

        assert.dom(document.createElement('div'), function () {
          Dom.setBoolean('checked', true, this);
          assert.same(this.getAttribute('checked'), 'checked');
          Dom.setBoolean('checked', false, this);
          assert.same(this.getAttribute('checked'), null);
        });

        Dom.tpl.Foo.$helpers({
          myHelper() {
            Dom.setBoolean('disabled', this.on);
          },
        });

        assert.dom(Dom.tpl.Foo.$render({on: true}), function () {
          assert.same(this.getAttribute('disabled'), 'disabled');

          Dom.ctx(this).updateAllTags({on: false});

          assert.same(this.getAttribute('disabled'), null);
        });
      });

      group('with rendered', () => {
        beforeEach(() => {
          v.foo = Dom.tpl.Foo.$render();

          document.body.appendChild(v.foo);
        });

        test('focus', () => {
          document.body.appendChild(Dom.textToHtml('<form><button name="bt"><input type="text" name="inp"><button name="b2"></form>'));
          assert.dom('form', function () {
            assert.dom('[name=b2]', function () {
              this.focus();
              assert.same(document.activeElement, this);
            });
            Dom.focus(this);
            assert.dom('[name=inp]', function () {
              assert.same(document.activeElement, this);
            });
            Dom.focus(this, '[name=bt]');
            assert.dom('[name=bt]', function () {
              assert.same(document.activeElement, this);
            });
          });
        });

        test('replace element', () => {
          Dom.newTemplate({name: 'Foo.Bar', nodes: [{name: 'span'}]});
          Dom.newTemplate({name: 'Foo.Baz', nodes: [{name: 'h1'}]});

          const dStub = Dom.tpl.Foo.Bar.$destroyed = (...args) => {
            if (v) v.args = args;
          };

          let bar = Dom.tpl.Foo.Bar.$render();
          const baz = Dom.tpl.Foo.Baz.$render();

          v.foo.appendChild(bar);

          assert.dom('#foo', function () {
            assert.dom('>span', function () {
              v.barCtx = this[ctx$];
            });
            Dom.replaceElement(baz, bar);
            const ctx = this[ctx$];
            assert.dom('>h1', function () {
              assert.same(ctx, this[ctx$].parentCtx);
            });
            refute.dom('>span');
            assert.same(v.args[0], v.barCtx);
            assert.isNull(bar[ctx$]);

            bar = Dom.tpl.Foo.Bar.$render();

            Dom.replaceElement(bar, baz, 'noRemove');

            assert.dom('>span', function () {
              assert.same(ctx, this[ctx$].parentCtx);
            });
            refute.dom('>h1');
            assert.same(v.args[0], v.barCtx);
            refute.isNull(baz[ctx$]);
          });
        });
      });
    });

    test('rendering svg', () => {
      Template.newTemplate({
        name: 'Foo',
        nodes: [{
          name: 'section',
          attrs: [],
          children: [{
            name: 'svg',
            attrs: [],
            children: [{name: 'path', attrs: [['=', 'd', 'M0,0 10,10Z']]}],
          }, {name: 'div', attrs: [], children: []}],
        }],
      });

      assert.dom(Dom.tpl.Foo.$render(), (section) => {
        assert.dom('svg', (svg) => {
          assert(svg instanceof window.SVGSVGElement);
          assert.dom('path', (path) => {
            assert(path instanceof window.SVGPathElement);
            assert.equals(path.getAttribute('d'), 'M0,0 10,10Z');
          });
        });
        assert.dom('div', (div) => {
          assert(div instanceof window.HTMLElement);
        });
      });
    });

    test('setting namespace', () => {
      Template.newTemplate({
        name: 'Foo', ns: 'http://www.w3.org/2000/svg',
        nodes: [{
          name: 'g',
          children: [{
            name: 'image',
            attrs: [['=', 'xlink:href', '/abc.jpg']],
          }, {
            name: 'image',
            attrs: [['=', 'xlink:href', ['', 'image2']]],
          }, {
            name: 'foreignObject',
            attrs: [], children: [
              {name: 'div', ns: 'http://www.w3.org/1999/xhtml'},
            ],
          }],
        }],
      });

      assert.dom(Dom.tpl.Foo.$render({image2: '/def.jpg'}), (g) => {
        assert.dom('image:first-child', (image) => {
          assert(image instanceof window.SVGImageElement);
          assert.equals(image.getAttributeNS('http://www.w3.org/1999/xlink', 'href'), '/abc.jpg');
        });
        assert.dom('image:nth-child(2)', (image) => {
          assert(image instanceof window.SVGImageElement);
          assert.equals(image.getAttributeNS('http://www.w3.org/1999/xlink', 'href'), '/def.jpg');
        });
        assert.dom('foreignObject', (foreignObject) => {
          isClient && assert(foreignObject instanceof window.SVGForeignObjectElement);
          assert.dom('div', (div) => {
            isClient && assert(div instanceof window.HTMLDivElement);
          });
        });
      });
    });

    test('rendering fragment', () => {
      Template.newTemplate({
        name: 'Foo',
        nodes: [{
          name: 'div',
          attrs: [['=', 'id', 'div1']],
          children: [' ', ['', 'bar'], ' '],
        }, {
          name: 'div',
          attrs: [['=', 'id', 'div2']],
        }],
      });

      const frag = Dom.tpl.Foo.$render({});

      assert.same(frag.nodeType, document.DOCUMENT_FRAGMENT_NODE);
      assert(frag[ctx$]);
    });

    test('inserting Document Fragment', () => {
      Template.newTemplate({
        name: 'Foo',
        nodes: [{
          name: 'div',
          attrs: [],
          children: [' ', ['', 'bar'], ' '],
        }],
      });

      let content;

      Dom.tpl.Foo.$helpers({
        bar() {
          return content.apply(this, arguments);
        },
      });

      content = () => {
        const frag = document.createDocumentFragment();
        frag.appendChild(Dom.h({id: 'e1', div: 'e1'}));
        frag.appendChild(Dom.h({id: 'e2', div: 'e2'}));
        frag.appendChild(Dom.h({id: 'e3', div: 'e3'}));
        return frag;
      };

      const elm = Dom.tpl.Foo.$render({});
      assert.dom(elm, function () {
        assert.dom('div', {count: 3});
      });

      content = () => {
        const frag = document.createDocumentFragment();
        frag.appendChild(Dom.h({id: 'n1', p: 'n1'}));
        frag.appendChild(Dom.h({id: 'n2', p: 'n2'}));
        return frag;
      };

      Dom.ctx(elm).updateAllTags();
      assert.dom(elm, function () {
        refute.dom('div');
        assert.dom('p', {count: 2});
      });

      content = () => {
        const elm = document.createElement('span');
        elm.textContent = 'foo';
        return elm;
      };

      Dom.ctx(elm).updateAllTags();
      assert.dom(elm, function () {
        refute.dom('p');
        assert.dom('span', 'foo', function () {
          assert.same(this.nextSibling.nodeType, document.TEXT_NODE);
        });
      });
    });

    group('$render', () => {
      /**
       * Render a template without events
       */
      beforeEach(() => {
        api.protoMethod();
      });

      test('autostop', () => {
        Dom.newTemplate({
          name: 'Foo',
          nodes: [{name: 'div'}],
        });

        const elm = Dom.tpl.Foo.$render({});
        const ctx = Dom.ctx(elm);
        const stub1 = stub();
        const stub2 = stub();
        ctx.onDestroy({stop: stub1})
          .onDestroy(stub2);

        Dom.remove(elm);

        assert.called(stub1);
        assert.called(stub2);

        stub1.reset();
        Dom.remove(elm);

        refute.called(stub1);
      });

      test('cleanup on exception', () => {
        Dom.newTemplate({
          name: 'Foo',
          nodes: [{
            name: 'div',
            children: [' ', ['', 'bar'], ' '],
          }],
        });

        Dom.tpl.Foo.$helpers({
          bar() {
            throw new Error('bang');
          },
        });

        spy(Dom, 'destroyData');

        try {
          Dom.tpl.Foo.$render({});
        } catch (ex) {
          v.ex = ex;
        }
        assert.equals(v.ex.toStringPrefix, 'while rendering: Foo\n');

        assert.calledWith(Dom.destroyData, match((elm) => elm.tagName === 'DIV'));
      });

      test('no frag if only one child node', () => {
        Dom.newTemplate({
          name: 'Foo',
          nodes: [{name: 'div'}],
        });

        const elm = Dom.tpl.Foo.$render({});
        assert.same(elm.nodeType, document.ELEMENT_NODE);
        assert.same(elm.tagName, 'DIV');
      });

      test('frag if multi childs', () => {
        Dom.newTemplate({
          name: 'Foo',
          nodes: [{name: 'div'}, {name: 'span'}, {name: 'section'}],
        });
        const frag = Dom.tpl.Foo.$render({});
        assert.same(frag.nodeType, document.DOCUMENT_FRAGMENT_NODE);

        const ctx = frag.firstChild[ctx$];
        assert.same(frag.firstChild.tagName, 'DIV');

        assert.same(ctx, frag.firstChild.nextSibling[ctx$]);
        assert.same(ctx, frag.lastChild[ctx$]);
      });

      test('attributes', () => {
        Dom.newTemplate({
          name: 'Foo',
          nodes: [{
            name: 'div', attrs: [
              ['=', 'id', ['', 'id']],
              ['=', 'class', ['', 'classes']],
              ['=', 'data-id', ['', ['.', 'user', ['_id']]]],
              ['', 'draggable'],
            ],
            children: [],
          }],
        });

        Dom.tpl.Foo.$helpers({
          classes() {
            return 'the classes';
          },

          draggable() {
            Dom.current.element.setAttribute('draggable', 'true');
          },
        });

        assert.dom(Dom.tpl.Foo.$render({id: 'foo', user: {_id: '123'}}), (elm) => {
          assert.same(elm.getAttribute('id'), 'foo');
          assert.same(elm.getAttribute('class'), 'the classes');
          assert.same(elm.getAttribute('data-id'), '123');

          assert.same(elm.getAttribute('draggable'), 'true');

          const ctx = Dom.myCtx(elm);
          ctx.data.user._id = 0;
          ctx.updateAllTags();

          assert.same(elm.getAttribute('data-id'), '0');
        });
      });

      test('parent', () => {
        Dom.newTemplate({
          name: 'Foo.Bar',
          nested: [{
            name: 'Baz',
          }],
        });

        assert.same(null, Dom.tpl.Foo.parent);
        assert.same(Dom.tpl.Foo, Dom.tpl.Foo.Bar.parent);
        assert.same(Dom.tpl.Foo.Bar, Dom.tpl.Foo.Bar.Baz.parent);
        assert.same(Dom.tpl.Foo.Bar.$fullname, 'Foo.Bar');

        assert.isTrue(Dom.tpl.Foo.$contains(Dom.tpl.Foo));
        assert.isTrue(Dom.tpl.Foo.$contains(Dom.tpl.Foo.Bar.Baz));
        assert.isFalse(Dom.tpl.Foo.Bar.$contains(Dom.tpl.Foo));
      });

      test('updateElement', () => {
        Dom.newTemplate({
          name: 'Foo',
          nodes: [{
            name: 'div',
            children: [{
              name: 'h1',
              attrs: [['', 'foo', [['.', 'user', ['nameFunc']]]]],
              children: [['', ['.', 'user', ['name']]]],
            }, {
              name: 'label',
              attrs: [['=', 'class', 'search']],
              children: [['', ['.', 'user', ['initials']]]],
            }],
          }, {
            name: 'h2',
            children: [['', ['.', 'user', ['name']]]],
          }],
        });

        Dom.tpl.Foo.$helpers({
          foo(arg) {
            Dom.current.element.setAttribute('data-foo', arg);
          },
        });

        const elm = Dom.tpl.Foo.$render(v.data = {user: {initial: 'fb', name: 'Foo', nameFunc() {
          return this.name;
        }}});
        document.body.appendChild(elm);

        assert.dom('h1', 'Foo', function () {
          assert.msg('should set this correctly when calling nested function')
            .same(this.getAttribute('data-foo'), 'Foo');

          v.data.user.name = 'Bar';
          Dom.ctx(elm).updateElement(this);
          assert.dom(this, 'Bar');
        });
      });

      test('updateElement 2', () => {
        Dom.newTemplate({
          name: 'Foo',
          nodes: [{
            name: 'div',
            children: [['', 'name'], {
              name: 'p',
              children: [['', 'name']],
            }],
          }],
        });

        const data = {name: 'foo'};

        assert.dom(Dom.tpl.Foo.$render(data), function () {
          assert.dom('p', 'foo', function () {
            data.name = 'bar';
            Dom.updateElement(this);
            assert.same(this.textContent, 'bar');
          });
          assert.same(this.textContent, 'foobar');
        });
      });

      test('body', () => {
        Dom.newTemplate({
          name: 'Foo',
          nodes: [{
            name: 'div',
            children: [['', ['.', 'user', ['initials']]]],
          }],
        });

        assert.dom(Dom.tpl.Foo.$render({user: {initials: 'fb'}}), 'fb');
      });
    });

    test('registerHelpers', () => {
      const Foo = Dom.newTemplate({
        name: 'Foo.Super',
        nodes: [],
      });

      Foo.$helpers({
        _test_name() {
          return this.name.toUpperCase();
        },
      });

      Dom.registerHelpers({
        _test_name() {return 'global name'},
        _test_age() {return 'global age'},
      });

      after(() => {Dom._helpers._test_name = Dom._helpers._test_age = null});

      const data = {name: 'sally'};

      assert.same(Foo._helpers._test_name.call(data), 'SALLY');
      assert.same(Foo._helpers._test_age.call(data), 'global age');
      assert.same(Dom._helpers._test_name.call(data), 'global name');
    });

    test('extends', () => {
      const Super = Dom.newTemplate({
        name: 'Foo.Super',
      });

      Dom.newTemplate({
        name: 'Foo.Super.Duper',
      });

      Super.$helpers({
        superFoo() {
          return this.name.toUpperCase();
        },
      });

      Super.$extend({
        fuz() {
          return 'fuz';
        },
      });

      const Sub = Dom.newTemplate({
        name: 'Foo.Sub',
        extends: '../Foo.Super', // test lookup works
        nodes: [{
          name: 'div',
          children: [['', 'superFoo']],
        }],
        nested: [{
          name: 'Duper',
        }],
      });

      assert.same(Sub.Duper.parent, Sub);

      assert.same(Sub.fuz(), 'fuz');
      assert.dom(Sub.$render({name: 'susan'}), 'SUSAN');
    });
  });
});

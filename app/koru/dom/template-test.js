isClient && define(function (require, exports, module) {
  /**
   * DomTemplate is used to create interactive
   * [Dom Trees](https://developer.mozilla.org/en-US/docs/Web/API/Node)
   **/
  const koru = require('koru');
  const Dom  = require('koru/dom');
  const Ctx  = require('koru/dom/ctx');
  const TH   = require('koru/test');
  const api  = require('koru/test/api');
  const util = require('koru/util');

  const {ctx$} = require('koru/symbols');

  const DomTemplate = require('./template');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
      api.module();
    },

    tearDown() {
      v = null;
      delete Dom.Foo;
      Dom.removeChildren(document.body);
    },

    "test stopEvent"() {
      const ev = {stopImmediatePropagation: this.stub(), preventDefault: this.stub()};
      Dom.stopEvent(ev);
      assert.called(ev.stopImmediatePropagation);
      assert.called(ev.preventDefault);
      const Tpl = Dom.newTemplate({
        name: "Foo",
        nodes:[{
          name:"div",
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
        TH.test.stub(ev, 'stopImmediatePropagation');
        TH.test.stub(ev, 'preventDefault');
        this.dispatchEvent(ev);
        assert.called(ev.stopImmediatePropagation);
        assert.called(ev.preventDefault);
        assert(v.success);

        v.success = false;

        ev = Dom.buildEvent('keydown');
        TH.test.stub(ev, 'stopImmediatePropagation');
        TH.test.stub(ev, 'preventDefault');
        this.dispatchEvent(ev);
        assert.called(ev.stopImmediatePropagation);
        assert.called(ev.preventDefault);
        assert(v.success);
      });
    },

    "test relative name"() {
      Dom.newTemplate({
        name: "Bar.Baz.Buzz",
        nodes:[{
          name:"div",
          children: [' ', ['>', '../../Fnord.Sub.Sub', ['=', 'x', 123]]],
        }],
      });

      Dom.newTemplate({
        name: "Bar.Fnord.Sub.Sub",
        nodes: [{
          name: 'div',
          children: ["hello Fnord"],
        }],
      });

      assert.dom(Dom.Bar.Baz.Buzz.$render({}), function () {
        assert.dom('div', 'hello Fnord');
      });
    },

    "partial": {
      setUp () {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{
            name:"section",
            attrs: [["=","id","FooId"]],
            children:[' ', ['>', '/Bar']],
          }],
        });

        Dom.newTemplate({
          name: "Bar",
          nodes:[{
            name:"div",
            children:[' ', ['>', 'Baz', ['=', 'initials', 'myFunc']]],
          }],
        });

        Dom.newTemplate({
          name: "Bar.Baz",
          nodes:[{
            name:"input",
            attrs:[["=","type",'text'], ["=", 'value', ['', 'initials']]],
            children: [{
              name: 'article',
              attrs: [['=', 'id', 'BazArticle']],
            }],
          }],
        });
      },

      tearDown () {
        Dom.removeChildren(document.body);
        delete Dom.Bar;
      },

      "test setCtx"() {
        const elm = Dom.Foo.$render({});
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
      },

      "test find ctx"() {
        Dom.Bar.$helpers({
          myFunc() {
            v.helperFoundCtx = Dom.Foo.$ctx();

            return 'one';
          },
        });
        const elm = Dom.Foo.$render({});

        assert.same(v.helperFoundCtx, elm[ctx$]);

        assert.dom(elm, function () {
          assert.dom('input', {value: 'one'}, function () {
            const ctx = Dom.Foo.$ctx(this);
            assert.same(ctx, elm[ctx$]);
            assert.same(ctx.element(), elm);
          });
        });

        document.body.appendChild(elm);

        assert.dom('#FooId');
        assert.same(Dom.Foo.$ctx('FooId'), elm[ctx$]);
        assert.same(Dom.Foo.$data('FooId'), elm[ctx$].data);
        assert.same(Dom.Foo.$data(elm.querySelector('#BazArticle')), elm[ctx$].data);

        assert.same(Dom.ctxById('FooId'), elm[ctx$]);
      },

      "test updateAllTags"() {
        const elm = Dom.Foo.$render({myFunc: 'one'});

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
      },

      "test restoring focus"() {
        Dom.Bar.$helpers({
          myFunc() {
            v.helperFoundCtx = Dom.Foo.$ctx();

            document.activeElement.blur(); // same effect as moving the focused element
            return 'foo';
          },
        });
        const elm = Dom.Foo.$render({});

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
      },

      "test default arg is data"() {
        Dom.Bar.$created = this.stub();

        const data = {arg: 'me'};
        Dom.Foo.$render(data);

        assert.calledWith(Dom.Bar.$created, TH.match(function (ctx) {
          assert.same(ctx.data, data);
          return true;
        }));
      },

      "test scoping"() {
        const initials = 'BJ';
        Dom.Bar.$helpers({
          myFunc() {
            return initials;
          },
        });
        const result = Dom.Foo.$render({});

        assert.dom(result, function () {
          assert.dom('>div>input', {value: 'BJ'});
        });
      },
    },

    "test $actions"() {
      Dom.newTemplate({name: "Foo"});
      Dom.Foo.$actions({
        one: v.one = this.stub(),
        two: this.stub(),
      });

      assert.same(Dom.Foo._events.length, 2);
      assert.same(Dom.Foo._events[0][0], 'click');
      assert.same(Dom.Foo._events[0][1], '[name=one]');

      const event = {};

      Dom.Foo._events[0][2](event);

      assert.calledWithExactly(v.one, event);
    },

    "test focus,blur are capture events"() {
      Dom.newTemplate({name: 'Foo', nodes: [{
        name: 'div', children: [
          {name: 'button'},
        ]
      }]});
      Dom.Foo.$events({
        'focus button': v.focus = this.stub(),
        'blur button': v.blur = this.stub(),
      });

      const foo = Dom.Foo.$render({});

      this.stub(foo, 'addEventListener');
      Dom.Foo.$attachEvents(foo);

      assert.calledWith(foo.addEventListener, 'focus', TH.match(f => v.f = f), true);
      assert.calledWith(foo.addEventListener, 'blur', v.f, true);

      v.f(v.ev = {type: 'focus', currentTarget: foo, target: foo.querySelector('button')});

      assert.calledWith(v.focus, v.ev);
      v.f(v.ev = {type: 'blur', currentTarget: foo, target: foo.querySelector('button')});

      assert.calledWith(v.blur, v.ev);

      this.stub(foo, 'removeEventListener');
      Dom.Foo.$detachEvents(foo);

      assert.calledWith(foo.removeEventListener, 'focus', v.f, true);
      assert.calledWith(foo.removeEventListener, 'blur', v.f, true);
    },

    "menustart": {
      setUp() {
        Dom.newTemplate({name: 'Foo', nodes: [{
          name: 'div', children: [
            {name: 'button'},
          ]
        }]});
        Dom.Foo.$events({
          'menustart button': v.menustart = this.stub(),
        });

        v.foo = Dom.Foo.$render({});
        document.body.append(v.foo);

        this.spy(v.foo, 'addEventListener');
        Dom.Foo.$attachEvents(v.foo);
        v.target = v.foo.querySelector('button');
        v.ev = {
          target: v.target,
          currentTarget: v.foo,
        };
      },

      "test non touch pointerdown"() {
        Dom.triggerEvent(v.target, 'pointerdown');
        assert.calledWith(v.menustart, TH.match(ev => ev.type === 'pointerdown'));
      },

      "test touch click"() {
        Dom.triggerEvent(v.target, 'pointerdown', {pointerType: 'touch'});

        refute.called(v.menustart);
        Dom.triggerEvent(v.target, 'click');

        assert.calledWith(v.menustart, TH.match(ev => ev.type === 'click'));
      },

      "test $detachEvents"() {
        assert.calledWithExactly(v.foo.addEventListener, 'pointerdown', TH.match(
          f => v.pointerdown = f));
        this.spy(v.foo, 'removeEventListener');
        Dom.Foo.$detachEvents(v.foo);

        assert.calledWithExactly(v.foo.removeEventListener, 'pointerdown', v.pointerdown);
      },
    },

    "dragstart on touch": {
      setUp() {
        Dom.newTemplate({name: 'Foo', nodes: [{
          name: 'div', children: [
            {name: 'span', attrs: [['=', 'draggable', 'true']]},
          ]
        }]});
        Dom.Foo.$events({
          'dragstart span': v.dragStart = this.stub(),
        });

        v.foo = Dom.Foo.$render({});
        document.body.append(v.foo);

        this.stub(v.foo, 'addEventListener');
        Dom.Foo.$attachEvents(v.foo);
        assert.calledWithExactly(v.foo.addEventListener, 'dragstart', TH.match.func);
        assert.calledWithExactly(v.foo.addEventListener, 'touchstart', TH.match(
          f => v.touchstart = f));

        this.stub(koru, 'setTimeout').returns(321);
        this.stub(koru, 'clearTimeout');
        v.target = v.foo.querySelector('span');
        this.stub(document, 'addEventListener');
        v.touchstartEvent = {
          type: 'touchstart', currentTarget: v.foo,
          target: v.target,
          touches: [{clientX: 30, clientY: 60}],
        };
        v.start = function () {
          v.touchstart(v.touchstartEvent);

          assert.calledWith(document.addEventListener, 'touchend', TH.match(f => v.touchend = f),
                            Dom.captureEventOption);

          assert.calledWith(document.addEventListener, 'touchmove', TH.match(f => v.touchmove = f),
                            Dom.captureEventOption);
        };
      },

      "test touch and hold"() {
        v.start();

        assert.calledWith(koru.setTimeout, TH.match.func, 300);

        koru.setTimeout.reset();
        this.stub(document, 'removeEventListener');
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

        assert.calledWith(koru.setTimeout, TH.match(to => v.to = to), 300);
        refute.called(v.dragStart);
        this.stub(Dom, 'triggerEvent');
        v.to();
        assert.calledWith(Dom.triggerEvent, v.target, 'dragstart', {clientX: 30, clientY: 60});

        this.stub(v.foo, 'removeEventListener');
        Dom.Foo.$detachEvents(v.foo);

        assert.calledWithExactly(v.foo.removeEventListener, 'dragstart', TH.match.func);
        assert.calledWithExactly(v.foo.removeEventListener, 'touchstart', v.touchstart);
      },

      "test move cancels"() {
        v.start();

        refute.called(koru.clearTimeout);

        this.stub(document, 'removeEventListener');

        v.touchmove({touches: [{clientX: 35, clientY: 60}]});

        assert.calledWithExactly(koru.clearTimeout, 321);
        assert.calledTwice(document.removeEventListener);
      },

      "test end cancels"() {
         v.start();

        refute.called(koru.clearTimeout);

        this.stub(document, 'removeEventListener');

        v.touchend({touches: [{clientX: 35, clientY: 60}]});

        refute.called(koru.clearTimeout);
        refute.called(document.removeEventListener);

        v.touchend({touches: []});

        assert.calledWithExactly(koru.clearTimeout, 321);
        assert.calledTwice(document.removeEventListener);
      },

      "test dragging"() {
        v.start();

        koru.setTimeout.yield();

        this.stub(Dom, 'triggerEvent');
        v.touchmove(v.ev = {
          target: v.target,
          touches: [{clientX: 35, clientY: 60}],
          preventDefault: this.stub(),
          stopImmediatePropagation: this.stub(),
        });

        assert.calledWith(Dom.triggerEvent, v.target, 'pointermove', {clientX: 35, clientY: 60});
        assert.called(v.ev.preventDefault);
        assert.called(v.ev.stopImmediatePropagation);

        this.stub(document, 'removeEventListener');
        v.touchend({target: v.target,
                    touches: []});

        assert.calledWith(Dom.triggerEvent, v.target, 'pointerup', {clientX: 35, clientY: 60});

        assert.calledTwice(document.removeEventListener);
      },
    },

    "test event calling"() {
      Dom.newTemplate({name: 'Foo', nodes: [{
        name: 'div', children: [
          {name: 'span'},
          {name: 'button'},
        ]
      }]});
      v.spanCall = this.stub();
      Dom.Foo.$events({
        'click div': v.divCall = this.stub(),

        'click span'(event) {
          v.spanCall();
          v.stop && Dom[v.stop].call(Dom);
        },
      });
      Dom.Foo.$event('click button', v.buttonCall = this.stub());

      document.body.appendChild(Dom.Foo.$render({}));

      assert.dom('body>div', function () {
        const top = this;
        TH.test.onEnd(function () {Dom.remove(top)});
        TH.test.spy(top, 'addEventListener');
        Dom.Foo.$attachEvents(top);
        assert.calledOnce(top.addEventListener);
        Dom.ctx(top).onDestroy(function () {
          Dom.Foo.$detachEvents(top);
        });
        assert.dom('span', function () {
          top.addEventListener.yield({
            currentTarget: top, target: this, type: 'click',
            stopImmediatePropagation: v.sip = TH.test.stub(),
            preventDefault: v.pd = TH.test.stub(),
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
            stopImmediatePropagation: v.sip = TH.test.stub(),
            preventDefault: v.pd = TH.test.stub(),
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
            stopImmediatePropagation: v.sip = TH.test.stub(),
            preventDefault: v.pd = TH.test.stub(),
          });
        });
        assert.called(v.spanCall);
        refute.called(v.divCall);
        assert.called(v.sip);
        refute.called(v.pd);

        Dom.Foo.$detachEvents(top);
        Dom.remove(top);
        Dom.Foo.$detachEvents(top);

      });
    },

    "newTemplate": {
      setUp() {
      },

      "test simple"() {
        /**
         * Create a new `DomTemplate` from an html blueprint.
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
        const myMod = {id: 'myMod', onUnload: this.stub(),
                       __proto__: module.constructor.prototype};
        assert.same(DomTemplate.newTemplate(myMod, {
          name: "Foo", nodes: [{name: "div"}]
        }), Dom.Foo);

        const tpl = Dom.Foo;
        assert.same(tpl.name, "Foo");
        assert.equals(tpl.nodes, [{name: "div"}]);
        assert.equals(tpl._helpers, null);
        assert.equals(tpl._events, []);

        myMod.onUnload.yield();
        refute(Dom.Foo);
      },

      "test not found"() {
        const tp = Dom.newTemplate({name: "Foo.Bar.Baz"});
        assert.same(Dom.lookupTemplate('Foo.Fizz.Bar'), undefined);
      },

      "test nest by name"() {
        const fbb = Dom.newTemplate({name: "Foo.Bar.Baz"});
        const fff = Dom.newTemplate({name: "Foo.Fnord.Fuzz"});

        assert.same(fbb, Dom.lookupTemplate("Foo.Bar.Baz"));
        assert.same(fbb, Dom.lookupTemplate.call(Dom.lookupTemplate("Foo"), "Bar.Baz"));
        assert.same(fff, Dom.lookupTemplate.call(fbb, "../../Fnord.Fuzz"));

        const tpl = Dom.Foo.Bar;
        assert.same(tpl.name, 'Bar');
        assert.same(tpl._helpers, undefined);
        assert.same(Dom.lookupTemplate("Foo.Bar"), tpl);


        assert.same(tpl.Baz.name, 'Baz');

        Dom.newTemplate({name: "Foo"});

        assert.same(Dom.Foo.name, 'Foo');
        assert.same(Dom.Foo.Bar.Baz.name, 'Baz');

        Dom.newTemplate({name: "Foo.Bar"});

        assert.same(Dom.Foo.Bar.name, 'Bar');
        assert.equals(tpl._helpers, null);
        assert.same(Dom.Foo.Bar.Baz.name, 'Baz');
      },
    },

    "with template": {
      setUp () {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{name: "div", attrs:[["=","id",'foo'], ["", 'myHelper']],}],
        });
      },

      "test $created"() {
        const pCtx = {foo: 'bar'};
        Dom.Foo.$extend({
          $created(ctx, elm) {
            v.ctx = ctx;
            assert.same(ctx.parentCtx, pCtx);

            v.elm = elm;
            ctx.data = {myHelper: v.myHelper = TH.test.stub()};
          },
        });

        assert.dom(Dom.Foo.$render({}, pCtx), function () {
          assert.called(v.myHelper);
          assert.same(v.elm, this);
          assert.same(v.ctx, Dom.ctx(this));
        });
      },

      "test setBoolean"() {
        assert.exception(function () {
          Dom.setBoolean('disabled', true);
        });

        assert.dom(document.createElement('div'), function () {
          Dom.setBoolean('checked', true, this);
          assert.same(this.getAttribute('checked'), 'checked');
          Dom.setBoolean('checked', false, this);
          assert.same(this.getAttribute('checked'), null);
        });

        Dom.Foo.$helpers({
          myHelper() {
            Dom.setBoolean('disabled', this.on);
          },
        });

        assert.dom(Dom.Foo.$render({on: true}), function () {
          assert.same(this.getAttribute('disabled'), 'disabled');

          Dom.ctx(this).updateAllTags({on: false});

          assert.same(this.getAttribute('disabled'), null);
        });
      },

      "with rendered": {
        setUp () {

          v.foo = Dom.Foo.$render();

          document.body.appendChild(v.foo);
        },

        "test focus"() {
          document.body.appendChild(Dom.html('<form><button name="bt"><input type="text" name="inp"><button name="b2"></form>'));
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
        },

        "test replace element"() {
          Dom.newTemplate({name: 'Foo.Bar', nodes: [{name: 'span'}]});
          Dom.newTemplate({name: 'Foo.Baz', nodes: [{name: 'h1'}]});

          const dStub = Dom.Foo.Bar.$destroyed = function (...args) {
            if (v) v.args = args;
          };

          let bar = Dom.Foo.Bar.$render();
          const baz = Dom.Foo.Baz.$render();

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

            bar = Dom.Foo.Bar.$render();

            Dom.replaceElement(bar, baz, 'noRemove');

            assert.dom('>span', function () {
              assert.same(ctx, this[ctx$].parentCtx);
            });
            refute.dom('>h1');
            assert.same(v.args[0], v.barCtx);
            refute.isNull(baz[ctx$]);
          });
        },
      },
    },

    "test rendering svg"() {
      DomTemplate.newTemplate({
        name: "Foo",
        nodes: [{
          name: 'svg',
          attrs: [],
          children: [{name: 'path', attrs: [['=', 'd', 'M0,0 10,10Z']]}]
        }],
      });

      const svg = Dom.Foo.$render();
      assert(svg instanceof window.SVGSVGElement);
      assert.dom(svg, svg => {
        assert.dom('path', path => {
          assert(path instanceof window.SVGPathElement);
          assert.equals(path.getAttribute('d'), 'M0,0 10,10Z');
        });
      });
    },

    "test rendering fragment"() {
      DomTemplate.newTemplate({
        name: "Foo",
        nodes: [{
          name:"div",
          attrs: [["=","id","div1"]],
          children: [" ",["","bar"]," "]
        }, {
          name:"div",
          attrs: [["=","id","div2"]],
        }],
      });

      const frag = Dom.Foo.$render({});

      assert.same(frag.nodeType, document.DOCUMENT_FRAGMENT_NODE);
      assert(frag[ctx$]);
    },

    "test inserting Document Fragment"() {
      DomTemplate.newTemplate({
        name: "Foo",
        nodes: [{
          name:"div",
          attrs:[],
          children: [" ",["","bar"]," "],
        }],
      });

      let content;

      Dom.Foo.$helpers({
        bar() {
          return content.apply(this, arguments);
        },
      });

      content = function () {
        const frag = document.createDocumentFragment();
        frag.appendChild(Dom.html('<div id="e1">e1</div>'));
        frag.appendChild(Dom.html('<div id="e2">e2</div>'));
        frag.appendChild(Dom.html('<div id="e3">e3</div>'));
        return frag;
      };

      const elm = Dom.Foo.$render({});
      assert.dom(elm, function () {
        assert.dom('div', {count: 3});
      });

      content = function () {
        const frag = document.createDocumentFragment();
        frag.appendChild(Dom.html('<p id="n1">n1</p>'));
        frag.appendChild(Dom.html('<p id="n2">n2</p>'));
        return frag;
      };

      Dom.ctx(elm).updateAllTags();
      assert.dom(elm, function () {
        refute.dom('div');
        assert.dom('p', {count: 2});
      });

      content = function () {
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
    },

    "$render": {
      "test autostop"() {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{name: "div"}],
        });

        const elm = Dom.Foo.$render({});
        const ctx = Dom.ctx(elm);
        const stub1 = this.stub();
        const stub2 = this.stub();
        ctx.onDestroy({stop: stub1})
          .onDestroy(stub2);

        Dom.remove(elm);

        assert.called(stub1);
        assert.called(stub2);

        stub1.reset();
        Dom.remove(elm);

        refute.called(stub1);
      },

      "test cleanup on exception"() {
        Dom.newTemplate({
          name: "Foo",
          nodes: [{
            name:"div",
            children: [" ",["","bar"]," "],
          }],
        });

        Dom.Foo.$helpers({
          bar() {
            throw new Error('bang');
          },
        });

        this.spy(Dom, 'destroyData');

        try {
          Dom.Foo.$render({});
        } catch (ex) {
          v.ex = ex;
        }
        assert.equals(v.ex.toString(), 'while rendering: Foo\nbang');

        assert.calledWith(Dom.destroyData, TH.match(elm => elm.tagName === 'DIV'));
      },

      "destroyMeWith": {
        setUp () {
          v.elm = Dom.h({div: "subject"});
          v.elmCtx = Dom.setCtx(v.elm);

          v.dep = Dom.h({div: "dep"});
          v.depCtx = Dom.setCtx(v.dep);

          document.body.appendChild(v.elm);
          document.body.appendChild(v.dep);
          Dom.destroyMeWith(v.dep, v.elm);

          v.dep2 = Dom.h({div: "dep2"});
          v.dep2Ctx = Dom.setCtx(v.dep2);

          document.body.appendChild(v.dep2);
          Dom.destroyMeWith(v.dep2, v.elm);
        },

        "test removes with"() {
          Dom.remove(v.elm);
          assert.same(v.elm[ctx$], null);
          assert.same(v.dep[ctx$], null);
          assert.same(v.dep.parentNode, null);
          assert.same(v.dep2[ctx$], null);
          assert.same(v.dep2.parentNode, null);
        },

        "test detaches if removed"() {
          Dom.remove(v.dep);
          const obs = {};
          assert(v.dep2Ctx.__id);
          obs[v.dep2Ctx.__id] = v.dep2;
          assert.equals(v.elm[ctx$].__destoryObservers, obs);

          Dom.remove(v.dep2);
          assert.same(v.elm[ctx$].__destoryObservers, undefined);
        },
      },

      "test no frag if only one child node"() {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{name: "div"}],
        });

        const elm = Dom.Foo.$render({});
        assert.same(elm.nodeType, document.ELEMENT_NODE);
        assert.same(elm.tagName, 'DIV');
      },

      "test frag if multi childs"() {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{name: "div",}, {name: 'span'}, {name: 'section'}],
        });
        const frag = Dom.Foo.$render({});
        assert.same(frag.nodeType, document.DOCUMENT_FRAGMENT_NODE);

        const ctx = frag.firstChild[ctx$];
        assert.same(frag.firstChild.tagName, 'DIV');

        assert.same(ctx, frag.firstChild.nextSibling[ctx$]);
        assert.same(ctx, frag.lastChild[ctx$]);
      },


      "test attributes"() {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{
            name:"div",attrs:[
              ["=","id",["","id"]],
              ["=","class",["","classes"]],
              ["=","data-id",["","user._id"]],
              ["","draggable"]
            ],
            children:[],
          }],
        });

        Dom.Foo.$helpers({
          classes() {
            return "the classes";
          },

          draggable() {
            Dom.current.element.setAttribute('draggable', 'true');
          },
        });

        assert.dom(Dom.Foo.$render({id: 'foo', user: {_id: '123'}}), function () {
          assert.same(this.getAttribute('id'), 'foo');
          assert.same(this.getAttribute('class'), 'the classes');
          assert.same(this.getAttribute('data-id'), '123');

          assert.same(this.getAttribute('draggable'), 'true');
        });
      },

      "test parent"() {
        Dom.newTemplate({
          name: "Foo.Bar",
          nested: [{
            name: "Baz",
          }],
        });

        assert.same(null, Dom.Foo.parent);
        assert.same(Dom.Foo, Dom.Foo.Bar.parent);
        assert.same(Dom.Foo.Bar, Dom.Foo.Bar.Baz.parent);
        assert.same(Dom.Foo.Bar.$fullname, 'Foo.Bar');

        assert.isTrue(Dom.Foo.$contains(Dom.Foo));
        assert.isTrue(Dom.Foo.$contains(Dom.Foo.Bar.Baz));
        assert.isFalse(Dom.Foo.Bar.$contains(Dom.Foo));
      },

      "test updateElement"() {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{
            name:"div",
            children:[{
              name:"h1",
              attrs:[['', 'foo', '.user.nameFunc']],
              children:[['', 'user.name']]
            },{
              name:"label",
              attrs:[["=", "class", "search"]],
              children:[['', 'user.initials']],
            }]
          }, {
            name: "h2",
            children:[['', 'user.name']],
          }],
        });

        Dom.Foo.$helpers({
          foo(arg) {
            Dom.current.element.setAttribute('data-foo', arg);
          },
        });

        const elm = Dom.Foo.$render(v.data = {user: {initial: 'fb', name: 'Foo', nameFunc() {
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
      },

      "test updateElement 2"() {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{
            name:"div",
            children:[['', 'name'], {
              name:"p",
              children:[['', 'name']],
            }],
          }],
        });

        const data = {name: 'foo'};

        assert.dom(Dom.Foo.$render(data), function () {
          assert.dom('p', 'foo', function () {
            data.name = 'bar';
            Dom.updateElement(this);
            assert.same(this.textContent, 'bar');
          });
          assert.same(this.textContent, 'foobar');
        });
      },

      "test body"() {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{
            name:"div",
            children:[['', 'user.initials']],
          }],
        });

        assert.dom(Dom.Foo.$render({user: {initials: 'fb'}}), 'fb');
      },
    },

    "test registerHelpers"() {
      const Foo = Dom.newTemplate({
        name: "Foo.Super",
        nodes:[],
      });

      Foo.$helpers({
        _test_name() {
          return this.name.toUpperCase();
        },
      });

      Dom.registerHelpers({
        _test_name() {return "global name"},
        _test_age() {return "global age"},
      });

      this.onEnd(function () {
        Dom._helpers._test_name = null;
        Dom._helpers._test_age = null;
      });

      const data = {name: 'sally'};

      assert.same(Foo._helpers._test_name.call(data), "SALLY");
      assert.same(Foo._helpers._test_age.call(data), "global age");
      assert.same(Dom._helpers._test_name.call(data), "global name");
    },

    "test extends"() {
      const Super = Dom.newTemplate({
        name: "Foo.Super",
      });

      Dom.newTemplate({
        name: "Foo.Super.Duper"
      });

      Super.$helpers({
        superFoo() {
          return this.name.toUpperCase();
        },
      });

      Super.$extend({
        fuz() {
          return "fuz";
        },
      });

      const Sub = Dom.newTemplate({
        name: "Foo.Sub",
        extends: "../Foo.Super", // test lookup works
        nodes:[{
          name:"div",
          children:[['', 'superFoo']],
        }],
        nested: [{
          name: "Duper"
        }]
      });

      assert.same(Sub.Duper.parent, Sub);

      assert.same(Sub.fuz(), "fuz");
      assert.dom(Sub.$render({name: 'susan'}), 'SUSAN');
    },
 });
});

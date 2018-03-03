isClient && define(function (require, exports, module) {
  'use strict';
  /**
   * Ctx (Context) is used to track
   * [DOM elements](https://developer.mozilla.org/en-US/docs/Web/API/Node)
   **/
  const TH   = require('koru/test');
  const api  = require('koru/test/api');
  const util = require('koru/util');
  const Dom  = require('../dom');

  const {private$, ctx$} = require('koru/symbols');

  const Ctx  = require('./ctx');
  var test, v;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      api.module();
    },

    tearDown() {
      v = null;
      delete Dom.Foo;
      Dom.removeChildren(document.body);
    },

    "evalArgs": {
      "test constant"() {
        assert.equals(Ctx[private$].evalArgs({}, ['"name', ['=', 'type', '"text'], ['=', 'count', '"5']]), ['name', {type: 'text', count: '5'}]);
      },
    },

    "test data"() {
      /**
       * The data associated with an element via this context
       **/
      api.protoProperty('data');
      const ctx = new Ctx(null, null, v.data = {});

      assert.same(ctx.data, v.data);
    },

    "test parentCtx"() {
      /**
       * The associated parent Ctx
       **/
      api.protoProperty('parentCtx');
      const pCtx = new Ctx();
      const ctx = new Ctx(null, pCtx);

      assert.same(ctx.parentCtx, pCtx);
    },

    "Ctx.current": {
      /**
       * Hello world
       **/
      "test no currentCtx data"() {
        Ctx._currentCtx = undefined;
        assert.equals(Ctx.current.data(null), undefined);
      },

      "test data"() {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{
            name:"section",
            children:[['', "testMe"]],
          }],
        });
        Dom.Foo.$helpers({
          testMe() {
            assert.same(this, Ctx.current.data());
            assert.same(this, v.x);
            assert.same(Ctx.current.isElement(), v.isElement);
            v.isElement || assert.same(Ctx.current.ctx, Dom.ctx(Dom.current.element));


            v.data = Ctx.current.data(v.elm);

            v.testHelper = Ctx.current.getValue('testHelper', 5, 7);

            v.dataValue = Ctx.current.getValue('myundef');

            return v.elm;
          },

          testHelper(a, b) {
            return a + b;
          },
        });

        const data = {me: true};

        v.elm = Dom.h({});
        v.elm[ctx$] = {data: data};

        v.isElement = false;

        const foo = Dom.Foo.$render(v.x = {x: 1});

        assert.same(v.testHelper, 12);
        assert.same(v.dataValue, null);
        v.dataValue = undefined;


        assert.same(v.data, data);

        v.isElement = true;

        v.data = null;

        Dom.myCtx(foo).updateAllTags(v.x = {x: 2, get myundef() {}});

        assert.same(v.data, data);
        assert.same(Dom.myCtx(foo).data, v.x);
        assert.same(v.dataValue, null);
      },
    },

    "test onAnimationEnd"() {
      var Tpl = Dom.newTemplate({
        name: "Foo",
        nodes:[{
          name: "div",
          children:[['', "bar"]],
        }],
      });

      Tpl.$helpers({
        bar() {
          return Dom.h({class: this.name});
        },
      });

      document.body.appendChild(v.elm = Dom.Foo.$render({}));

      test.stub(document.body, 'addEventListener');
      test.stub(document.body, 'removeEventListener');

      // Repeatable
      Dom.myCtx(v.elm).onAnimationEnd(v.stub = test.stub(), 'repeat');
      assert.calledWith(document.body.addEventListener, 'animationend', TH.match(
        arg => v.animationEndFunc = arg), true);

      // Element removed
      document.body.appendChild(v.elm2 = Dom.Foo.$render({}));
      Dom.myCtx(v.elm2).onAnimationEnd(v.stub2 = test.stub());

      // Set twice
      document.body.appendChild(v.elm3 = Dom.Foo.$render({name: 'bar'}));

      var ctx = Dom.myCtx(v.elm3);
      ctx.onAnimationEnd(v.stub3old = test.stub());
      ctx.onAnimationEnd(v.stub3 = test.stub());

      assert.calledWith(v.stub3old, ctx, v.elm3);


      // Cancelled before called
      document.body.appendChild(v.elm4 = Dom.Foo.$render({}));
      Dom.myCtx(v.elm4).onAnimationEnd(v.stub4 = test.stub());
      Dom.myCtx(v.elm4).onAnimationEnd('cancel');

      // Body listener only set once
      assert.calledOnce(document.body.addEventListener);

      // fire events...

      // should repeat fire
      document.body.addEventListener.yield({target: v.elm});
      assert.calledWith(v.stub, Dom.myCtx(v.elm), v.elm);
      document.body.addEventListener.yield({target: v.elm});
      assert.calledTwice(v.stub);
      refute.called(v.stub2);

      Dom.remove(v.elm);

      // only last func fires
      document.body.addEventListener.yield({target: v.elm3});
      assert.called(v.stub3);

      // stil one listener
      refute.called(document.body.removeEventListener);

      // should remove body listener since last element
      Dom.remove(v.elm2);
      assert.calledWith(document.body.removeEventListener,
                        'animationend', v.animationEndFunc, true);
    },
 });
});

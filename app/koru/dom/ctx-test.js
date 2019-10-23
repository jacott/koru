isClient && define((require, exports, module)=>{
  'use strict';
  /**
   * Ctx (Context) is used to track
   * [DOM elements](https://developer.mozilla.org/en-US/docs/Web/API/Node)
   **/
  const DocChange       = require('koru/model/doc-change');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const Dom             = require('../dom');

  const {stub, spy} = TH;

  const {private$, ctx$} = require('koru/symbols');

  const Ctx  = require('./ctx');

  let v = {};

  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      api.module();
    });

    afterEach(()=>{
      delete Dom.tpl.Foo;
      Dom.removeChildren(document.body);
      v = {};
    });

    group("evalArgs", ()=>{
      test("constant", ()=>{
        assert.equals(Ctx[private$].evalArgs(
          {}, ['"name', ['=', 'type', '"text'], ['=', 'count', '"5']]
        ), ['name', {type: 'text', count: '5'}]);
      });
    });

    group("autoUpdate", ()=>{
      /**
       * Update template contents whenever the `ctx.data` contents changes or the `ctx.data` object
       * itself changes.
       *
       * `ctx.data` (or supplied subject) must have either an `observeId` method or an `onChange`
       * method in its class otherwise no observation will occur. `observeId` is used in
       * preference to `onChange`. {#koru/model/base-model} is such a class.
       *
       * @param subject override `ctx.data` as the subject. Custom subjects cannot be auto changed.

       * @param {function} [removed] a function that will be called if the subject is removed.

       * @returns handle with a `stop` method to stop listening for changes. This is automatically
       * called when the data goes out of scope.
       **/

      before(()=>{
        api.protoMethod();

        Dom.newTemplate({
          name: "Foo",
          nodes:[{
            name:"section",
            children:[['', "child.name"], ['', "_id"]],
          }],
        });
      });

      test("options", ()=>{
        //[
        class Custom {
          static onChange(onChange) {
            this._onChange = onChange;
            return {stop: stub()};
          }
        }

        const doc = new Custom();
        const foo = Dom.tpl.Foo.$render({child: doc});
        const ctx = Dom.myCtx(foo);

        const removed = stub();

        const handle = ctx.autoUpdate({subject: doc, removed});

        doc.name = "new name";
        Custom._onChange(DocChange.change(doc, {name: 'old name'})); // change

        assert.equals(foo.textContent, "new name");
        //]

        refute.called(removed);
        refute.called(handle.stop);
        spy(ctx, 'updateAllTags');

        Custom._onChange(DocChange.delete(doc)); // remove subject
        assert.calledWith(removed, doc);
        assert.called(handle.stop);
        refute.called(ctx.updateAllTags);
      });

      group("observeId", ()=>{
        class MyModel {
          constructor(id, child) {
            this._id = id;
            this.child = child;
          }

          static observeId(id, onChange) {
            this._id = id;
            this._onChange = onChange;
            return this._handle = {stop: stub()};
          }
        }

        afterEach(()=>{
          MyModel._id = MyModel._onChange = MyModel._handle = undefined;
        });

        test("remove", ()=>{
          const foo = Dom.tpl.Foo.$render();
          const ctx = Dom.myCtx(foo);
          spy(ctx, 'updateAllTags');

          ctx.data = new MyModel("id1", {name: 'name 1'});
          const removed = stub();
          ctx.autoUpdate({removed});

          MyModel._onChange(DocChange.delete(ctx.data));
          assert.called(MyModel._handle.stop);
          refute.called(ctx.updateAllTags);
          assert.calledWith(removed, ctx.data);

          ctx.data = new MyModel("id2", {name: 'x'});

          assert.same(MyModel._id, "id2");
          refute.called(ctx.updateAllTags);

          ctx.data.child.name = 'name 2';
          MyModel._onChange(DocChange.change(ctx.data, {}));
          assert.same(foo.textContent, 'name 2id2');

          Dom.remove(foo);
          assert.called(MyModel._handle.stop);
        });

        test("change", ()=>{
          const ctx = new Ctx();
          ctx.updateAllTags = stub();

          const doc = new MyModel("id1");
          ctx.autoUpdate();

          ctx.data = doc;
          assert.same(MyModel._id, "id1");

          const doc1 = new MyModel("id1");
          MyModel._onChange(DocChange.change(doc1, {}));
          assert.called(ctx.updateAllTags);
          assert.same(ctx.data, doc1);
          ctx.updateAllTags.reset();

          MyModel._onChange(DocChange.add(doc));
          assert.called(ctx.updateAllTags);
          ctx.updateAllTags.reset();

          const h1 = MyModel._handle;
          refute.called(h1.stop);

          const doc2 = new MyModel("id2");
          ctx.data = doc2;

          assert.called(h1.stop);

          assert.same(MyModel._id, "id2");
          refute.same(h1, MyModel._handle);

          ctx._destroyData();

          assert.called(MyModel._handle.stop);
        });
      });
    });

    test("data", ()=>{
      /**
       * The data associated with an element via this context
       **/
      api.protoProperty('data');
      const ctx = new Ctx(null, null, v.data = {});

      assert.same(ctx.data, v.data);
    });

    test("parentCtx", ()=>{
      /**
       * The associated parent Ctx
       **/
      api.protoProperty('parentCtx');
      const pCtx = new Ctx();
      const ctx = new Ctx(null, pCtx);

      assert.same(ctx.parentCtx, pCtx);
    });

    test("addEventListener", ()=>{
      /**
       * This is like the `Node#addEventListener` except that it will call
       * `Node#removeEventListener` when the `ctx` is destroyed. Also handle the koru event type
       * `'menustart'`.
       **/
      api.protoMethod();
      //[
      const ctx = new Ctx();
      const button = Dom.h({button: [], type: 'button'});
      Dom.setCtx(button, ctx);
      const callback = stub(), callback2 = stub(), opts = {capture: true};
      ctx.addEventListener(button, 'menustart', callback, opts);
      ctx.addEventListener(button, 'mouseover', callback2);

      // touch
      Dom.triggerEvent(button, 'pointerdown', {pointerType: 'touch'});
      refute.called(callback);
      Dom.triggerEvent(button, 'click', {pointerType: 'touch'});
      assert.calledOnce(callback);

      // mouse
      callback.reset();
      Dom.triggerEvent(button, 'pointerdown');
      assert.called(callback);
      Dom.triggerEvent(button, 'click');
      assert.calledOnce(callback);
      Dom.triggerEvent(button, 'click');
      assert.calledTwice(callback);

      // mouseover
      Dom.triggerEvent(button, 'mouseover');
      assert.called(callback2);

      // destroy
      Dom.destroyData(button);
      callback.reset();
      Dom.triggerEvent(button, 'pointerdown');
      refute.called(callback);

      Dom.triggerEvent(button, 'mouseover');
      assert.calledOnce(callback2);
      //]
    });

    group("Ctx.current", ()=>{
      /**
       * Hello world
       **/
      test("no currentCtx data", ()=>{
        Ctx._currentCtx = undefined;
        assert.equals(Ctx.current.data(null), undefined);
      });

      test("data", ()=>{
        Dom.newTemplate({
          name: "Foo",
          nodes:[{
            name:"section",
            children:[['', "testMe"]],
          }],
        });
        Dom.tpl.Foo.$helpers({
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

        const foo = Dom.tpl.Foo.$render(v.x = {x: 1});

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
      });
    });

    test("onAnimationEnd", ()=>{
      const Tpl = Dom.newTemplate({
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

      document.body.appendChild(v.elm = Dom.tpl.Foo.$render({}));

      stub(document.body, 'addEventListener');
      stub(document.body, 'removeEventListener');

      // Repeatable
      Dom.myCtx(v.elm).onAnimationEnd(v.stub = stub(), 'repeat');
      assert.calledWith(document.body.addEventListener, 'animationend', TH.match(
        arg => v.animationEndFunc = arg), true);

      // Element removed
      document.body.appendChild(v.elm2 = Dom.tpl.Foo.$render({}));
      Dom.myCtx(v.elm2).onAnimationEnd(v.stub2 = stub());

      // Set twice
      document.body.appendChild(v.elm3 = Dom.tpl.Foo.$render({name: 'bar'}));

      const ctx = Dom.myCtx(v.elm3);
      ctx.onAnimationEnd(v.stub3old = stub());
      ctx.onAnimationEnd(v.stub3 = stub());

      assert.calledWith(v.stub3old, ctx, v.elm3);


      // Cancelled before called
      document.body.appendChild(v.elm4 = Dom.tpl.Foo.$render({}));
      Dom.myCtx(v.elm4).onAnimationEnd(v.stub4 = stub());
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
    });
  });
});

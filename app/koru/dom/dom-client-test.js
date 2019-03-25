define((require, exports, module)=>{
  'use strict';
  // Adorn koru/dom/base with extra client only utilities
  const Ctx             = require('koru/dom/ctx');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const util            = require('koru/util');

  const {stub, spy, onEnd, match: m} = TH;

  const {ctx$, private$, endMarker$} = require('koru/symbols');

  const Dom = require('koru/dom');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      api.module({subjectModule: module.get('koru/dom')});
    });

    afterEach(()=>{
      Dom.flushNextFrame();
      document.body.removeAttribute('class');
      Dom.removeChildren(document.body);
      delete Dom.Foo;
      v = {};
      Ctx[private$].currentElement = null;
    });

    group("ensureInView", ()=>{
      /**
       * Ensure that `elm` is as visible as possible with minimal scrolling.
       **/

      beforeEach(()=>{
        api.method();
      });

      test("horizontal", ()=>{
        //[
        // horizontal scroll
        const block = (text)=>Dom.h({
          style: 'flex:0 0 50px', div: [text]});

        const divs = 'one two three four five'.split(' ').map(t => block(t));
        const container = Dom.h({
          style: 'margin:30px;width:75px;height:30px;overflow:scroll;',
          div: {
            style: 'display:flex;width:300px',
            div: divs,
          }
        });

        document.body.appendChild(container);
        Dom.ensureInView(divs[1]);
        assert.near(container.scrollLeft, 39, 2);

        Dom.ensureInView(divs[0]);
        assert.equals(container.scrollLeft, 0, 2);
        //]

        const outer = Dom.h({
          style: 'margin:30px;width:30px;height:50px;overflow:visible',
          div: {div: container},
        });

        document.body.appendChild(outer);
        container.style.height = '50px';
        Dom.ensureInView(divs[2]);
        assert.near(container.scrollLeft, 89, 2);

        Dom.ensureInView(divs[1]);
        assert.near(container.scrollLeft, 50, 2);

        container.style.height = '80px';
        Dom.ensureInView(divs[2]);
        assert.near(container.scrollLeft, 89, 2);

        Dom.ensureInView(divs[4]);
        assert.near(container.scrollLeft, 189, 2);

        outer.style.overflow = 'scroll';
        Dom.ensureInView(divs[4]);
        assert.near(container.scrollLeft, 189, 2);
        assert.near(outer.scrollLeft, 83, 4);
      });

      test("vertical", ()=>{
        //[
        // vertical scroll
        const block = (text)=>Dom.h({style: 'width:50px;height:20px', div: [text]});

        const divs = 'one two three four five'.split(' ').map(t => block(t));
        const container = Dom.h({
          style: 'margin:30px;width:150px;height:30px;overflow:scroll',
          div: divs
        });

        document.body.appendChild(container);
        Dom.ensureInView(divs[1]);
        assert.equals(container.scrollTop, 20);

        Dom.ensureInView(divs[0]);
        assert.equals(container.scrollTop, 0);
        //]

        const outer = Dom.h({
          style: 'margin:30px;width:150px;height:50px;overflow:visible',
          div: {div: container},
        });

        document.body.appendChild(outer);
        container.style.height = '50px';
        Dom.ensureInView(divs[2]);
        assert.near(container.scrollTop, 25);

        Dom.ensureInView(divs[1]);
        assert.near(container.scrollTop, 20);

        container.style.height = '80px';
        Dom.ensureInView(divs[2]);
        assert.near(container.scrollTop, 20);

        Dom.ensureInView(divs[4]);
        assert.near(container.scrollTop, 35);

        outer.style.overflow = 'scroll';
        Dom.ensureInView(divs[4]);
        assert.near(container.scrollTop, 35);
        assert.near(outer.scrollTop, 61, 2);
      });
    });

    test("getBoundingClientRect", ()=>{
      /**
       * Get the
       * [boundingClientRect](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect)
       * for different types of objects namely: `Range` and `Element`. For a collapsed range the result
       * is calculated around caret position otherwise the object's `getBoundingClientRect` is
       * used. Also if an existing client rect can be passed it will be returned.
       *
       * @param object The object to calculate for.
       *
       * @return {Object} the rect parameters contains `left, top, width, height` and aliases.
       **/
      api.method();
      //[
      const div = Dom.h({
        style: 'position:absolute;left:25px;top:50px;width:150px;height:80px;'+
          'font-size:16px;font-family:monospace',
        contenteditable: true,
        div: ['Hello ', 'world', {br: ''}, {br: ''}, '']});
      document.body.appendChild(div);

      const keys = 'left top width height'.split(' '),
            rect = util.extractKeys(div.getBoundingClientRect(), keys);

      // an Element
      assert.equals(util.extractKeys(Dom.getBoundingClientRect(div), keys), rect);

      // a selection
      let range = document.createRange();
      range.selectNode(div);
      assert.near(util.extractKeys(Dom.getBoundingClientRect(range), keys), rect);

      // a position
      range.setStart(div.firstChild, 4); range.collapse(true);
      assert.near(util.extractKeys(Dom.getBoundingClientRect(range), keys), {
        left: 64, top: 50, width: 0, height: 19}, 2);

      // a client rect
      assert.same(Dom.getBoundingClientRect(rect), rect);
      //]

      // a line break
      range.setStart(div.lastChild.previousSibling, 0); range.collapse(true);
      assert.near(util.extractKeys(Dom.getBoundingClientRect(range), keys), {
        left: 25, top: 69, width: 0, height: 19}, 2);

      range.setStart(div.firstChild.nextSibling, 4); range.setEnd(range.startContainer, 5);
      const r2 = Dom.getBoundingClientRect(range);

      // end of line
      range.setStart(div.firstChild.nextSibling, 5); range.collapse(true);
      assert.near(util.extractKeys(Dom.getBoundingClientRect(range), keys), {
        left: r2.right, top: 50, width: 0, height: 19}, 2);
    });

    test("supports passive", ()=>{
      assert.isTrue(Dom.supportsPassiveEvents === true || Dom.supportsPassiveEvents === false);
    });

    test("captureEventOption", ()=>{
      if (Dom.supportsPassiveEvents)
        assert.equals(Dom.captureEventOption, {capture: true, passive: false});
      else
        assert.same(Dom.captureEventOption, true);
    });

    test("isAboveBottom", ()=>{
      /**
       * Determine if an element is above the bottom of a region.

       * @param {koru/dom/html-doc::Element|object} region either a
       * Dom `Element` or a `boundingClientRect`
       **/

      api.method('isAboveBottom');
      const x = Dom.h({$style: "position:absolute;left:-12px;width:20px;height:30px",
                     div: "x"});
      document.body.appendChild(x);

      assert(Dom.isAboveBottom(x, document.body));
      x.style.bottom = "-9px";
      assert(Dom.isAboveBottom(x, document.body));
      x.style.bottom = '';
      x.style.top = '110%';
      refute(Dom.isAboveBottom(x, document.body));

      x.style.top = '';
      x.style.bottom = '-17px';
      const rect = {top: 0, bottom: 50, left: 0, right: 40};
      refute(Dom.isAboveBottom(x, rect));
      rect.bottom = 2000;
      assert(Dom.isAboveBottom(x, rect));

      api.done();
    });

    test("isInView", ()=>{
      /**
       * Determine if an element is within the viewable area of a
       * `region`.
       *
       * @param {koru/dom/html-doc::Element|object} region either a
       * Dom `Element` or a `boundingClientRect`
       **/
      api.method('isInView');
      const x = Dom.h({$style: "position:absolute;left:-12px;width:20px;height:30px",
                     div: "x"});
      document.body.appendChild(x);

      refute(Dom.isInView(x, document.body));
      x.style.left = "-9px";
      assert(Dom.isInView(x, document.body));

      x.style.bottom = '-17px';
      const rect = {top: 0, bottom: 50, left: 0, right: 40};
      refute(Dom.isInView(x, rect));
      rect.bottom = 2000;
      assert(Dom.isInView(x, rect));

      api.done();

      x.style.bottom = '';
      x.style.left = '';
      x.style.right = '-9px';
      assert(Dom.isInView(x, document.body));
      x.style.right = '-11px';
      refute(Dom.isInView(x, document.body));
      x.style.right = '';

      x.style.top = '-17px';
      refute(Dom.isInView(x, document.body));
      x.style.top = "-14px";
      assert(Dom.isInView(x, document.body));
      x.style.top = '';
      x.style.bottom = '-14px';
      assert(Dom.isInView(x, document.body));
    });

    test("getClosest", ()=>{
      document.body.appendChild(Dom.h({class: 'foo', div: {span: 'hello'}}));

      assert.dom('span', span =>{
        assert.same(Dom.getClosest(span.firstChild, '.foo>span'), span);
        assert.same(Dom.getClosest(span.firstChild, '.foo'), span.parentNode);
      });
    });

    test("html string", ()=>{
      const elm = Dom.textToHtml('<div id="top"><div class="foo"><div class="bar">'+
                           '<button type="button" id="sp">Hello</button></div></div></div>');

      document.body.appendChild(elm);

      assert.dom('#top', top =>{
        assert.same(elm, top);

        assert.dom('>.foo', ()=>{ // doubles as a test for assert.dom directChild
          assert.dom('>.bar>button#sp', 'Hello');
        });
      });

      assert.same(Dom.h(elm), elm);

      const nested = Dom.h({div: [Dom.textToHtml('<div>hello</div>'), elm]});
      assert.same(nested.firstChild.nextSibling, elm);
      assert.same(nested.firstChild.textContent, 'hello');
    });

    test("childElementIndex", ()=>{
      const elm = Dom.h({});
      let child;
      elm.appendChild(child = document.createElement('b'));
      assert.same(Dom.childElementIndex(child), 0);

      elm.appendChild(child = document.createElement('b'));
      assert.same(Dom.childElementIndex(child), 1);

      elm.appendChild(document.createTextNode('text'));

      elm.appendChild(child = document.createElement('b'));
      assert.same(Dom.childElementIndex(child), 2);
    });

    test("mapToData", ()=>{
      const elm = Dom.h({});

      'one two three'.split(' ').forEach(data=>{
        const child = Dom.h({});
        Dom.setCtx(child, {data: data});
        assert.same(Dom.myCtx(child).firstElement, child);

        elm.appendChild(child);
      });

      assert.equals(Dom.mapToData(elm.children), ['one', 'two', 'three']);
    });

    test("setClassBySuffix", ()=>{
      const elm = {className: ''};

      Dom.setClassBySuffix('use', 'Mode', elm);
      assert.same(elm.className, 'useMode');

      Dom.setClassBySuffix('design', 'Mode', elm);
      assert.same(elm.className, 'designMode');

      Dom.setClassBySuffix('discard', 'Avatar', elm);
      assert.same(elm.className, 'designMode discardAvatar');

      Ctx[private$].currentElement = elm;

      Dom.setClassBySuffix('use', 'Mode');
      assert.same(elm.className, 'discardAvatar useMode');

      Dom.setClassBySuffix(null, 'Avatar');
      assert.same(elm.className, 'useMode');

      Dom.setClassBySuffix('devMode prod', 'Mode', elm);
      Dom.setClassBySuffix('devMode prod', 'Mode', elm);
      assert.same(elm.className, 'devMode prodMode');

      Dom.setClassBySuffix('', 'Mode', elm);
      assert.same(elm.className, '');
    });

    test("setClassByPrefix", ()=>{
      const elm = {className: ''};

      Dom.setClassByPrefix('use', 'mode-', elm);
      assert.same(elm.className, 'mode-use');

      Dom.setClassByPrefix('design', 'mode-', elm);
      assert.same(elm.className, 'mode-design');

      Ctx[private$].currentElement = elm;

      Dom.setClassByPrefix('discard', 'avatar-');
      assert.same(elm.className, 'mode-design avatar-discard');

      Dom.setClassByPrefix('use', 'mode-');
      assert.same(elm.className, 'avatar-discard mode-use');

      Dom.setClassByPrefix(null, 'avatar-');
      assert.same(elm.className, 'mode-use');
      Dom.setClassByPrefix('dev mode-prod', 'mode-');
      assert.same(elm.className, 'mode-dev mode-prod');

      Dom.setClassByPrefix('', 'mode-', elm);
      assert.same(elm.className, '');
    });

    test("getUpDownByClass", ()=>{
      const elm = Dom.textToHtml('<div id="top"><div class="foo"><div class="bar">'+
                           '<button type="button" id="sp">Hello</button></div>'+
                           '<div class="dest"></div></div></div>');

      assert.dom(elm, ()=>{
        assert.dom('#sp', sp =>{
          assert.className(Dom.getUpDownByClass(sp, 'foo', 'dest'), 'dest');
        });
      });
    });

    test("searchUpFor", ()=>{
      const top = Dom.textToHtml('<div id="top"><div class="foo"><div class="bar">'+
                           '<button type="button" id="sp">Hello</button></div></div></div>');

      assert.isNull(Dom.searchUpFor(
        top.querySelector('button').firstChild, elm => elm === top, 'bar'));
      assert.same(Dom.searchUpFor(
        top.querySelector('button').firstChild, elm => Dom.hasClass(elm, 'bar'), 'bar'
      ), top.firstChild.firstChild);

      assert.same(Dom.searchUpFor(
        top.querySelector('button').firstChild, elm => Dom.hasClass(elm, 'bar')
      ), top.firstChild.firstChild);
    });


    test("INPUT_SELECTOR, WIDGET_SELECTOR", ()=>{
      assert.same(Dom.INPUT_SELECTOR, 'input,textarea,select,select>option,[contenteditable="true"]');
      assert.same(Dom.WIDGET_SELECTOR, 'input,textarea,select,select>option,'+
                  '[contenteditable="true"],button,a');
    });

    test("$getClosest", ()=>{
      document.body.appendChild(Dom.textToHtml('<div><div class="foo"><div class="bar">'+
                                         '<button type="button" id="sp"></button>'+
                                         '</div></div></div>'));

      const button = document.getElementById('sp');

      const foobar = document.querySelector('.foo>.bar');

      stub(Dom, 'ctx').withArgs(foobar).returns('the ctx');

      assert.same(Dom.getClosest(button, '.foo>.bar'), foobar);
      assert.same(Dom.getClosestCtx(button, '.foo>.bar'), 'the ctx');
    });

    group("hideAndRemove", ()=>{
      beforeEach(()=>{
        v.onAnimationEnd = stub(Dom.Ctx.prototype, 'onAnimationEnd');
      });

      test("non existent", ()=>{
        Dom.hideAndRemove('Foo');

        refute.called(v.onAnimationEnd);
      });

      test("remove by id", ()=>{
        document.body.appendChild(Dom.h({id: 'Foo'}));

        assert.dom('#Foo', function () {
          Dom.setCtx(v.elm = this, v.ctx = new Dom.Ctx);
          Dom.hideAndRemove('Foo');

          assert.className(this, 'remElm');
        });

        assert.calledWith(v.onAnimationEnd, m.func);

        v.onAnimationEnd.yield(v.ctx, v.elm);

        refute.dom('#Foo');
      });

      test("remove by elm", ()=>{
        document.body.appendChild(v.elm = Dom.h({id: 'Foo'}));

        Dom.setCtx(v.elm, v.ctx = new Dom.Ctx);

        spy(v.ctx, 'onDestroy');

        Dom.hideAndRemove(v.elm);

        assert.dom('#Foo.remElm');

        assert.calledWith(v.onAnimationEnd, m.func);

        v.onAnimationEnd.yield(v.ctx, v.elm);

        refute.dom('#Foo');
      });
    });

    test("forEach", ()=>{
      const elm = Dom.textToHtml('<div></div>');
      document.body.appendChild(elm);
      for(let i = 0; i < 5; ++i) {
        elm.appendChild(Dom.textToHtml('<div class="foo">'+i+'</div>'));
      }

      let results = [];
      Dom.forEach(elm, '.foo', e =>{results.push(e.textContent)});

      assert.same(results.join(','), '0,1,2,3,4');

      results = 0;
      Dom.forEach(document, 'div', ()=>{++results;});

      assert.same(results, 6);
    });

    test("remove", ()=>{
      /**
       * Remove element and descontruct its {#koru/dom/ctx}
       **/
      api.method('remove');
      api.example(_=>{
        const elm = Dom.h({});
        Dom.setCtx(elm, new Dom.Ctx());
        document.body.appendChild(elm);

        assert.same(Dom.remove(elm), true);
        assert.same(Dom.myCtx(elm), null);
        assert.same(elm.parentNode, null);

        assert.same(Dom.remove(elm), false);
        assert.same(Dom.remove(null), undefined);
      });
    });

    test("removeAll", ()=>{
      stub(Dom, 'remove');

      const r1 = Dom.remove.withArgs(1);
      const r2 = Dom.remove.withArgs(2);

      Dom.removeAll([1, 2]);

      assert.called(r2);
      assert(r2.calledBefore(r1));
    });

    test("contains", ()=>{
      const elm = Dom.textToHtml('<div id="top"><div class="foo"><div class="bar">'+
                                 '<button type="button" id="sp">Hello</button></div></div></div>');

      assert.same(Dom.contains(elm, elm), elm);
      assert.same(Dom.contains(elm, elm.querySelector('.bar')), elm);
      assert.same(Dom.contains(elm.querySelector('.bar'), elm), null);
    });

    test("insertStartEndMarkers", ()=>{
      /**
       * Insert a pair of comments into `parent` that can be used for start and end markers.

       * @param parent the parent node to insert comments into
       * @param [before] the node to insert the comments before. Comments are appended if before is
       * missing or null.

       * @returns the start comment. end comment can be found by calling {#.endMarker}
       **/
      api.method();
      //[
      const footer = Dom.h({footer: 'footer'});
      const parent = Dom.h({div: footer});
      const startMarker = Dom.insertStartEndMarkers(parent, footer);
      //]

      assert.same(Dom.endMarker(startMarker), startMarker[endMarker$]);
      assert.same(startMarker.nextSibling, startMarker[endMarker$]);
      assert.same(footer.previousSibling.previousSibling, startMarker);
    });

    test("endMarker", ()=>{
      /**
       * Return the end marker for a start marker.
       *
       * See {#.insertStartEndMarkers}
       *
       **/
      api.method();
      //[
      const parent = Dom.h({});
      const startMarker = Dom.insertStartEndMarkers(parent);

      assert.same(Dom.endMarker(startMarker), startMarker.nextSibling);
      assert.same(Dom.endMarker(startMarker).nodeType, document.COMMENT_NODE);
      assert.same(Dom.endMarker(startMarker).data, 'end');
      //]
    });

    test("removeInserts", ()=>{
      /**
       * remove inserts between start end markers.
       *
       * @param start the start marker; see {#.insertStartEndMarkers}
       **/
      api.method();
      const parent = document.createElement('div');
      const startMarker = document.createComment('start');
      startMarker[endMarker$] = document.createComment('end');

      assert.same(Dom.endMarker(startMarker), startMarker[endMarker$]);

      parent.appendChild(startMarker);
      for (const i of [1,2,3]) parent.appendChild(document.createElement('p'));
      parent.appendChild(startMarker[endMarker$]);
      parent.appendChild(document.createElement('i'));

      spy(Dom, 'destroyChildren');

      Dom.removeInserts(startMarker);

      assert.calledThrice(Dom.destroyChildren);

      assert.same(parent.querySelectorAll('p').length, 0);
      assert.same(parent.querySelectorAll('i').length, 1);

      assert.same(startMarker.parentNode, parent);
      assert.same(startMarker[endMarker$].parentNode, parent);
    });


    test("onPointerUp", ()=>{
      Dom.newTemplate({name: 'Foo', nodes: [{
        name: 'div', children: [
          {name: 'span'},
        ]
      }]});
      Dom.Foo.$events({
        'pointerdown span'(event) {
          Dom.onPointerUp(e2 =>{
            v.ctx = Dom.current.ctx;
            v.target = e2.target;
          });
        },
      });

      document.body.appendChild(Dom.Foo.$autoRender({}));

      assert.dom('div>span', span =>{
        Dom.triggerEvent(span, 'pointerdown');
        Dom.triggerEvent(span, 'pointerup');

        assert.same(v.ctx, Dom.Foo.$ctx(span));
        assert.same(v.target, span);

        v.ctx = null;

        Dom.triggerEvent(span, 'pointerup');

        assert.same(v.ctx, null);
      });
    });

    test("modifierKey", ()=>{
      refute(Dom.modifierKey({}));
      assert(Dom.modifierKey({ctrlKey: true}));
      assert(Dom.modifierKey({shiftKey: true}));
      assert(Dom.modifierKey({metaKey: true}));
      assert(Dom.modifierKey({altKey: true}));
    });

    test("decimal helper", ()=>{
      Dom.newTemplate({name: 'Foo', nodes: [{
        name: 'div', children: [
          ["","decimal","foo",["=","format","\"3"]]
        ]
      }]});

      assert.dom(Dom.Foo.$render({foo: 123.45}), elm => {
        assert.same(elm.textContent, "123.450");
        Dom.ctx(elm).updateAllTags({foo: 423.45750001});
        assert.same(elm.textContent, "423.458");
        Dom.ctx(elm).updateAllTags({foo: null});
        assert.same(elm.textContent, "");
      });
    });

    test("comment helper", ()=>{
      Dom.newTemplate({name: 'Foo', nodes: [{
        name: 'div', children: [
          ["","comment","\"foo"]
        ]
      }]});

      assert.dom(Dom.Foo.$render({}), elm => {
        const comment = elm.firstChild;
        assert.equals(comment.nodeType, document.COMMENT_NODE);
        assert.equals(comment.data, 'foo');
      });
    });

    group("inputValue helper", ()=>{
      test("restore", ()=>{
        const elm = Ctx[private$].currentElement = {};
        TH.stubProperty(elm, 'value', {get() {return '34'}, set: v.stub = stub()});
        Dom.restoreOriginalValue(elm);
        refute.called(v.stub);

        Dom._helpers.inputValue('foo');

        assert.same(Dom.originalValue(elm), 'foo');

        assert.calledWith(v.stub, 'foo');

        Dom._helpers.inputValue();

        assert.calledWith(v.stub, '');

        v.stub.reset();
        Dom._helpers.inputValue(34);

        refute.called(v.stub);

        assert.same(Dom.originalValue(elm), 34);

        Dom.setOriginalValue(elm, 'bar');
        assert.same(Dom.originalValue(elm), 'bar');
        v.stub.reset();
        Dom.restoreOriginalValue(elm);
        assert.calledWith(v.stub, 'bar');

      });
    });

    group("destroyMeWith", ()=>{
      beforeEach( ()=>{
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
      });

      test("removes with", ()=>{
        Dom.remove(v.elm);
        assert.same(v.elm[ctx$], null);
        assert.same(v.dep[ctx$], null);
        assert.same(v.dep.parentNode, null);
        assert.same(v.dep2[ctx$], null);
        assert.same(v.dep2.parentNode, null);
      });

      test("detaches if removed", ()=>{
        const {destoryObservers$} = Ctx[private$];
        Dom.remove(v.dep);
        const obs = [m.is(v.dep2)];
        assert.equals(Array.from(v.elm[ctx$][destoryObservers$]), obs);

        Dom.remove(v.dep2);
        assert.same(Array.from(v.elm[ctx$][destoryObservers$]).length, 0);
      });
    });

    test("onDestroy", ()=>{
      v.elm = Dom.h({div: "subject"});
      v.elmCtx = Dom.setCtx(v.elm);
      v.elmCtx.onDestroy(v.st1 = stub());
      v.elmCtx.onDestroy(v.st2 = {stop: stub()});

      Dom.destroyData(v.elm);
      assert.calledWith(v.st1, v.elmCtx, v.elm);
      assert.same(v.st1.firstCall.thisValue, v.elmCtx);
      assert.calledWith(v.st2.stop, v.elmCtx, v.elm);
      assert.same(v.st2.stop.firstCall.thisValue, v.st2);
    });

    test("reposition", ()=>{
      /**
       * Align element with an origin
       **/
      // See SelectMenu for more testing
      api.method();
      const popup = Dom.h({class: 'popup', $style: 'position:absolute;width:200px;height:10px'});
      document.body.appendChild(popup);

      Dom.reposition('above', {popup, boundingClientRect: {left: 50, top: 100}});

      const rect = popup.getBoundingClientRect();

      assert.near(util.extractKeys(rect, ['left', 'top']), {left: 50, top: 90});
    });
  });
});

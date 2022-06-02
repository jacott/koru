define((require, exports, module) => {
  'use strict';
  /**
   * Utilities for interacting with the [Document Object Model](#mdn:/API/Document_Object_Model)
   *
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const util            = require('koru/util');

  const {stub, spy, after} = TH;

  const Dom = require('koru/dom');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    beforeEach(() => {
      api.module({subjectModule: module.get('koru/dom')});
    });

    afterEach(() => {
      document.body.textContent = '';
      v = {};
    });

    test('Dom cssQuery', () => {
      document.body.appendChild(v.result = Dom.h({class: 'foo',
                                                  section: {span: 'Hello'}}));

      document.body.appendChild(v.result = Dom.h({class: 'bar',
                                                  section: {span: 'Goodbye'}}));

      if (isClient) {
        assert.same(Dom('body>.bar>span').textContent, 'Goodbye');
        assert.same(Dom('span').textContent, 'Hello');
        assert.same(Dom('span', Dom('.bar')).textContent, 'Goodbye');
      } else {
        assert('no server css query yet');
      }
    });

    test('nodeIndex', () => {
      const node = Dom.h({div: ['one', 'two', 'three']});

      assert.same(Dom.nodeIndex(node.firstChild), 0);
      assert.same(Dom.nodeIndex(node.childNodes[1]), 1);
      assert.same(Dom.nodeIndex(node.childNodes[2]), 2);
    });

    test('walkNode', () => {
      const node = Dom.h({
        div: [
          'one', {span: ['two', '2.5']},
          'three', {B: [{I: 'i'}, {U: 'not me'}, {div: 'not here'}]}, 'nor me']});

      let ans = '';

      Dom.walkNode(node, (node, i) => {
        ans += node.nodeType === document.TEXT_NODE ? node.textContent : node.tagName;
        switch (node.tagName) {
        case 'I': return false; // don't visit
        case 'U':
          ans += i;
          return true; // stop walking
        }
      });

      assert.same(ans, 'oneSPANtwo2.5threeBIU1');
    });

    test('more Dom.h', () => {
      assert.sameHtml(
        Dom.h({name: 'bar', id: 's123', section: {span: 'Goodbye'}}).outerHTML,
        '<section name="bar" id="s123"><span>Goodbye</span></section>');

      assert.sameHtml(
        Dom.h({name: 'bar', id: 's123', h1: ['a', 'b']}).outerHTML,
        '<h1 name="bar" id="s123">ab</h1>');

      assert.sameHtml(
        Dom.h({class: 'bar', id: 's123', section: {span: 'Goodbye'}}).outerHTML,
        '<section class="bar" id="s123"><span>Goodbye</span></section>');

      assert.sameHtml(
        Dom.h({title: 'bar', name: 'foo', section: ['hello']}).outerHTML,
        '<section name="foo" title="bar">hello</section>');

      assert.sameHtml(
        Dom.h({$div: 'bar', ul: 'foo\nbar'}).outerHTML,
        '<ul div="bar">foo<br>bar</ul>');

      assert.sameHtml(
        Dom.h({style: ['input {width:100%}'], class: 'myStyle'}).outerHTML,
        '<style class="myStyle">input {width:100%}</style>');

      assert.exception((_) => {
        Dom.h({div: 'bar', ul: 'fuz'});
      }, {message: 'Ambiguous markup'});
    });

    test('svg Dom.h', () => {
      const elm = Dom.h({div: {class: 'foo bar', svg: [{
        path: [], d: 'M0,0 10,10Z',
      }, {
        foreignObject: {div: 'hello', xmlns: 'http://www.w3.org/1999/xhtml'},
      }]}});
      assert.dom(elm, (elm) => {
        assert.dom('svg', (svg) => {
          assert.same(svg.namespaceURI, 'http://www.w3.org/2000/svg');
          isClient && assert(svg instanceof window.SVGSVGElement);
          assert.dom('path', (path) => {
            assert.same(path.namespaceURI, 'http://www.w3.org/2000/svg');
            isClient && assert(path instanceof window.SVGPathElement);
            assert.equals(path.getAttribute('d'), 'M0,0 10,10Z');
          });
          assert.dom('foreignObject', (foreignObject) => {
            isClient && assert(foreignObject instanceof window.SVGForeignObjectElement);
            assert.dom('div', (div) => {
              assert.same(div.namespaceURI, 'http://www.w3.org/1999/xhtml');
              isClient && assert(div instanceof window.HTMLDivElement);
            });
          });
        });
      });

      assert.equals(Dom.htmlToJson(elm), {div: {class: 'foo bar', svg: [{
        path: [], d: 'M0,0 10,10Z',
      }, {
        foreignObject: {xmlns: 'http://www.w3.org/1999/xhtml', div: 'hello'},
      }]}});
    });

    test('classList', () => {
      const elm = document.createElement('div');

      refute(Dom.hasClass(null, 'foo'));
      refute(Dom.hasClass(elm, 'foo'));

      Dom.addClasses(elm, ['foo', 'baz']);
      assert(Dom.hasClass(elm, 'foo'));
      assert(Dom.hasClass(elm, 'baz'));

      Dom.addClass(null, 'foo');
      Dom.addClass(elm, 'foo');
      Dom.addClass(elm, 'bar');
      assert(Dom.hasClass(elm, 'foo'));
      assert(Dom.hasClass(elm, 'bar'));

      Dom.removeClass(null, 'bar');
      Dom.removeClass(elm, 'bar');
      assert(Dom.hasClass(elm, 'foo'));
      refute(Dom.hasClass(elm, 'bar'));

      // test toggle
      assert(Dom.toggleClass(elm, 'bar'));
      assert(Dom.hasClass(elm, 'bar'));

      refute(Dom.toggleClass(elm, 'bar'));
      refute(Dom.hasClass(elm, 'bar'));
    });

    if (isServer) return;
    // Client only tests

    test('makeMenustartCallback', () => {
      /**
       * Creates a function suitable for event listeners wanting to open a menu.
       **/
      api.method();
      //[
      const button = Dom.h({button: 'menu start'});
      document.body.appendChild(button);
      let count = 0;
      const menuStart = Dom.makeMenustartCallback((event, type) => {
        if (type === 'menustart') {
          ++count;
        }
      });
      button.addEventListener('pointerdown', menuStart);
      button.addEventListener('click', menuStart);

      // using mouse
      Dom.triggerEvent(button, 'pointerdown');
      assert.same(count, 1);
      Dom.triggerEvent(button, 'click');
      assert.same(count, 2);

      // using touch
      count = 0;
      Dom.triggerEvent(button, 'pointerdown', {pointerType: 'touch'});
      assert.same(count, 0);

      Dom.triggerEvent(button, 'click', {pointerType: 'touch'});
      assert.same(count, 1);
      //]

      // click without pointerdown
      const callback = stub();
      const ms = Dom.makeMenustartCallback(callback);

      ms({type: 'click'});
      assert.called(callback);

      ms({type: 'click'});
      assert.calledTwice(callback);
    });
  });
});

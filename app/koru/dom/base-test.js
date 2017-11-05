define(function (require, exports, module) {
  /**
   * Utilities for interacting with the
   * [Document Object Model](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model)
   *
   **/
  const Dom             = require('koru/dom');
  const TH              = require('koru/test');
  const api             = require('koru/test/api');
  const util            = require('koru/util');

  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
      api.module(module.get('koru/dom'));
    },

    tearDown() {
      document.body.textContent = '';
      v = null;
    },

    "test Dom cssQuery"() {
      document.body.appendChild(v.result = Dom.h({"class": 'foo',
                                                  section: {span: "Hello"}}));

      document.body.appendChild(v.result = Dom.h({"class": 'bar',
                                                  section: {span: "Goodbye"}}));


      if (isClient) {
        assert.same(Dom('body>.bar>span').textContent, "Goodbye");
        assert.same(Dom('span').textContent, "Hello");
        assert.same(Dom('span', Dom('.bar')).textContent, "Goodbye");
      } else
        assert("no server css query yet");
    },

    "test nodeIndex"() {
      const node = Dom.h({div: ['one', 'two',  'three']});

      assert.same(Dom.nodeIndex(node.firstChild), 0);
      assert.same(Dom.nodeIndex(node.childNodes[1]), 1);
      assert.same(Dom.nodeIndex(node.childNodes[2]), 2);
    },

    "test walkNode"() {
      var node = Dom.h({div: ['one', {span: ['two', '2.5']}, 'three', {B: [{I: 'i'}, {U: 'not me'}, {div: 'not here'}]}, 'nor me']});

      let ans = "";

      Dom.walkNode(node, function (node, i) {
        ans += node.nodeType === document.TEXT_NODE ? node.textContent : node.tagName;
        switch (node.tagName ) {
        case 'I': return false; // don't visit
        case 'U':
          ans+=i;
          return true; // stop walking
        }
      });

      assert.same(ans, "oneSPANtwo2.5threeBIU1");
    },

    "test htmlToJson"() {
      /**
       * Convert an `Element` to a plain `object`
       **/

      const obj = {class: 'greeting', id: "gId", section: {
        ul: [{li: {span: "Hello"}}, {li: 'two'}],
      }, 'data-lang': 'en'};

      api.method('htmlToJson');
      assert.equals(Dom.htmlToJson(Dom.h(obj)), obj);

      const assertConvert = json => {
        assert.elideFromStack.equals(Dom.htmlToJson(Dom.h(json)), json);
      };

      assertConvert({div: 'simple'});
      assertConvert({});
      assertConvert({id: 'Spinner', class: 'spinner dark'});
      assertConvert({ol: [{li: 'one'}, {style: 'width:10px', name: 'li2', li: ['two'], myattr: 'attr3'}]});
      assertConvert(['one', 'two', 'three']);
      assertConvert({input: [], name: 'email'});
      assertConvert({input: ''});
    },

    "test more Dom.h"() {
      assert.sameHtml(
        Dom.h({name: 'bar', id: "s123", section: {span: "Goodbye"}}).outerHTML,
        '<section name="bar" id="s123"><span>Goodbye</span></section>');

      assert.sameHtml(
        Dom.h({name: 'bar', id: "s123", h1: ['a', 'b']}).outerHTML,
        '<h1 name="bar" id="s123">ab</h1>');

      assert.sameHtml(
        Dom.h({class: 'bar', id: "s123", section: {span: "Goodbye"}}).outerHTML,
        '<section class="bar" id="s123"><span>Goodbye</span></section>');

      assert.sameHtml(
        Dom.h({title: 'bar', name: "foo", section: ['hello']}).outerHTML,
        '<section name="foo" title="bar">hello</section>');

      assert.sameHtml(
        Dom.h({$div: 'bar', ul: "foo\nbar"}).outerHTML,
        '<ul div="bar">foo<br>bar</ul>');

      assert.sameHtml(
        Dom.h({style: ['input {width:100%}'], class: 'myStyle'}).outerHTML,
        '<style class="myStyle">input {width:100%}</style>');

      assert.exception(_=>{
        Dom.h({div: 'bar', ul: 'fuz'});
      }, {message: 'Ambiguous markup'});
    },

    "test svg Dom.h"() {
      const elm = Dom.h({div: {svg: [{
        path: [], d: 'M0,0 10,10Z'
      }, {
        foreignObject: {div: 'hello', xmlns: "http://www.w3.org/1999/xhtml"}
      }]}});
      assert.dom(elm, elm =>{
        assert.dom('svg', svg =>{
          assert.same(svg.namespaceURI, 'http://www.w3.org/2000/svg');
          isClient && assert(svg instanceof window.SVGSVGElement);
          assert.dom('path', path => {
            assert.same(path.namespaceURI, 'http://www.w3.org/2000/svg');
            isClient && assert(path instanceof window.SVGPathElement);
            assert.equals(path.getAttribute('d'), 'M0,0 10,10Z');
          });
          assert.dom('foreignObject', foreignObject => {
            isClient && assert(foreignObject instanceof window.SVGForeignObjectElement);
            assert.dom('div', div => {
              assert.same(div.namespaceURI, 'http://www.w3.org/1999/xhtml');
              isClient && assert(div instanceof window.HTMLDivElement);
            });
          });
        });
      });

      assert.equals(Dom.htmlToJson(elm), {div: {svg: [{
        path: [], d: 'M0,0 10,10Z'
      }, {
        foreignObject: {xmlns: 'http://www.w3.org/1999/xhtml', div: 'hello'}
      }]}});
    },

    "test escapeHTML"() {
      assert.same(Dom.escapeHTML('<Testing>&nbsp;'), '&lt;Testing&gt;&amp;nbsp;');
    },

    "test Dom.h"() {
      /**
       * Convert an `object` into a html node.
       *
       * The tagName is determined by either its content not being a string or the other keys are
       * `id`, `class`, `style`, `xmlns` or start with a `$` (the $ is stripped).
       *
       * Array is used when multiple children. Comments have a key of `$comment$`. The tagName will
       * default to "div" if none is given.

       * When a tag is svg, itself and its children will be in the svg namespace (Client only).
       *
       * @param body an object to convert to a Dom node

       * @param xmlns use xmlns instead of html

       * @returns A Dom node
       **/
      api.method('h');

      const obj = {class: 'greeting', id: "gId", section: {
        ul: [{li: {span: "Hello"}}, {$comment$: 'a comment'}, {li: 'two'},
             {li: {width: 500, svg: [], viewBox: "0 0 100 100"}}],
      }, 'data-lang': 'en'};

      const ans = util.deepCopy(obj);
      ans.section.ul[3].li.width = '500';

      assert.equals(Dom.htmlToJson(Dom.h(obj)), ans);

      if (isClient) {
        assert(Dom.h({path: [], d: 'M0,0 10,10Z'}, Dom.SVGNS) instanceof window.SVGPathElement);
      }
    },

    "test classList"() {
      var elm = document.createElement('div');

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
    },
  });
});

define(function (require, exports, module) {
  /**
   * Utilities for interacting with the
   * [Document Object Model](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model)
   *
   **/
  const api = require('koru/test/api');
  const TH  = require('koru/test');
  const Dom = require('koru/dom');

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
      var node = Dom.h({div: ['one', 'two',  'three']});

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

    "test escapeHTML"() {
      assert.same(Dom.escapeHTML('<Testing>&nbsp;'), '&lt;Testing&gt;&amp;nbsp;');
    },

    "test Dom.h"() {
      /**
       * Convert an `object` into a html node.
       *
       * The tagName is determined by either its content not being a string or the other keys are
       * `id`, `class`, or `style` or start with a `$` (the $ is stripped).
       *
       * Array is used when multiple children. Comments have a key of `$comment$`. The tagName will
       * default to "div" if none is given.
       **/
      api.method('h');

      const obj = {class: 'greeting', id: "gId", section: {
        ul: [{li: {span: "Hello"}}, {$comment$: 'a comment'}, {li: 'two'}],
      }, 'data-lang': 'en'};

      assert.equals(Dom.htmlToJson(Dom.h(obj)), obj);
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

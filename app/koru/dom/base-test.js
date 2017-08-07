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
      }, '$data-lang': 'en'};

      api.method('htmlToJson');
      assert.equals(Dom.htmlToJson(Dom.h(obj)), obj);

      const assertConvert = json => {
        assert.elideFromStack.equals(Dom.htmlToJson(Dom.h(json)), json);
      };

      assertConvert({div: 'simple'});
      assertConvert({});
      assertConvert({id: 'Spinner', class: 'spinner dark'});
      assertConvert({ol: [{li: 'one'}, {$style: 'width:10px', $name: 'li2', li: 'two', $myattr: 'attr3'}]});
      assertConvert(['one', 'two', 'three']);
    },

    "test html"() {
      document.body.appendChild(v.result = Dom.h({"class": 'bar', id: "s123", section: {span: "Goodbye"}}));

      assert.sameHtml(v.result.outerHTML, '<section class="bar" id="s123"><span>Goodbye</span></section>');
    },

    "test escapeHTML"() {
      assert.same(Dom.escapeHTML('<Testing>&nbsp;'), '&lt;Testing&gt;&amp;nbsp;');
    },

    "test Dom.h"() {
      /**
       * Convert an `object` into a html node.
       *
       * `id` and `class` convert to attributes but other attributes
       * must be prefixed with a `$`. `$comment$` makes a comment
       *
       * Array is used when multiple children.
       * Non prefixed key is used for `tagName`.
       **/
      api.method('h');

      const obj = {class: 'greeting', id: "gId", section: {
        ul: [{li: {span: "Hello"}}, {$comment$: 'a comment'}, {li: 'two'}],
      }, '$data-lang': 'en'};

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

define((require, exports, module)=>{
  'use strict';
  /**
   * Utilities for building and converting [Nodes](#mdn:/API/Node)
   *
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  const Html = require('./html');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("escapeHTML", ()=>{
      /**
       * Escape special html characters
       **/
      api.method();
      //[
      assert.same(Html.escapeHTML('<Testing>&nbsp;'), '&lt;Testing&gt;&amp;nbsp;');
      //]
    });

    test("html", ()=>{
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

       * @alias h
       **/
      api.method();

      const body = {class: 'greeting', id: "gId", section: {
        ul: [{li: {span: "Hello"}}, {$comment$: 'a comment'}, {li: 'two'},
             {li: {width: 500, svg: [], viewBox: "0 0 100 100"}}],
      }, 'data-lang': 'en'};

      const ans = util.deepCopy(body);
      ans.section.ul[3].li.width = '500'; // gets converted back to string

      const section = Html.html(body);
      assert.equals(Html.htmlToJson(section), ans);

      const path = Html.html({path: [], d: 'M0,0 10,10Z'}, Html.SVGNS);
      assert(path instanceof (isClient ?  window.SVGPathElement : global.Element));

      const br = Html.h({br: ''});
      assert.isNull(br.firstChild);
    });

    test("htmlToJson", ()=>{
      /**
       * Convert an `Element` to a plain `object`
       **/

      const obj = {class: 'greeting', id: "gId", section: {
        ul: [{li: {span: "Hello"}}, {li: 'two'}],
      }, 'data-lang': 'en'};

      api.method('htmlToJson');
      assert.equals(Html.htmlToJson(Html.h(obj)), obj);

      const assertConvert = json => {
        assert.elide(()=>{assert.equals(Html.htmlToJson(Html.h(json)), json)});
      };

      assertConvert({div: 'simple'});
      assertConvert({});
      assertConvert({id: 'Spinner', class: 'spinner dark'});
      assertConvert({ol: [
        {li: 'one'}, {style: 'width:10px', name: 'li2', li: ['two'], myattr: 'attr3'}]});
      assertConvert(['one', 'two', 'three']);
      assertConvert({input: [], name: 'email'});
      assertConvert({input: ''});
      assertConvert({div: ['']});
    });
  });
});

define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  require('./ui/html-doc');
  var Dom = require('./dom-base');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      document.body.textContent = '';
      v = null;
    },

    "test Dom cssQuery": function () {
      document.body.appendChild(v.result = Dom.html({"class": 'bar', id: "s123", tag: 'section', span: {text: "Goodbye"}}));

      if (isClient)
        assert.same(Dom('body>.bar>span').textContent, "Goodbye");
      else
        assert("no server css query yet");
    },

    "test undefined textConent": function () {
      assert.same(Dom.html({text: undefined}).outerHTML, '<div>undefined</div>');
    },

    "test html": function () {
      document.body.appendChild(v.result = Dom.html({"class": 'bar', id: "s123", tag: 'section', span: {text: "Goodbye"}}));

      assert.sameHtml(v.result.outerHTML, '<section class="bar" id="s123"><span>Goodbye</span></section>');

      assert.same(Dom.html({html: ["hello ", undefined, {tag: 'span', text: 'cruel'}, ' world']}).outerHTML,
                  '<div>hello <span>cruel</span> world</div>');

      assert.same(Dom.html({content: ["one", {tag: "b"}, "two"]}).outerHTML, "<div>one<b></b>two</div>");
      assert.same(Dom.html({content: Dom.html(["one", undefined, "two"])}).outerHTML, "<div>onetwo</div>");
      assert.same(Dom.html({content: {content: "x"}}).outerHTML, '<div><div>x</div></div>');



      assert.same(Dom.html('<div id="d123" class="foo">bar</div>').outerHTML, '<div id="d123" class="foo">bar</div>');

      var frag = Dom.html(['one', {text: 'two'}, 'three']);
      assert.same(frag.nodeType, document.DOCUMENT_FRAGMENT_NODE);
      var div = document.createElement('div');
      div.appendChild(frag);
      assert.same(div.innerHTML, 'one<div>two</div>three');
    },

    "test escapeHTML": function () {
      assert.same(Dom.escapeHTML('<Testing>&nbsp;'), '&lt;Testing&gt;&amp;nbsp;');
    },

    "test classList": function () {
      var elm = document.createElement('div');

      refute(Dom.hasClass(null, 'foo'));
      refute(Dom.hasClass(elm, 'foo'));

      Dom.addClass(elm, 'foo');
      assert(Dom.hasClass(elm, 'foo'));

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

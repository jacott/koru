define(function (require, exports, module) {
  /**
   * Server side implementation of the DOM tree.
   **/
  const Dom             = require('koru/dom');
  const TH              = require('koru/test');
  const util            = require('koru/util');

  const sut  = require('./html-doc');

  let v = null;

  TH.testCase(module, {
    setUp() {
      v = {};
    },

    tearDown() {
      document.body.textContent = '';
      v = null;
    },

    "test getElementsByClassName"() {
      /**
       * Returns a list of all elements which have `className`.
       *
       * See [Element.getElementsByClassName()](https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByClassName)
       **/

      const html = Dom.h({div: [
        {},
        {div: [{class: 'foo bar'},
               {div: {class: 'foo bar-foo'}}]}
      ]});

      assert.equals(html.getElementsByClassName('foo').length, 2);
      assert.equals(html.getElementsByClassName('bar').length, 1);
      assert.same(html.getElementsByClassName('bar')[0].className, 'foo bar');
    },

    "test appendChild"() {
       const parent = Dom.h({div: [
        {class: 'foo'},
        {class: 'old-node'},
      ]});
      const oldParent = Dom.h({div: {class: 'new-node'}});
      const newNode = oldParent.firstChild;

      oldParent.appendChild(Dom.h({id: 'foo'}));

      assert.same(
        parent.appendChild(newNode),
        newNode);
      assert.equals(util.map(oldParent.childNodes, n => n.outerHTML), ['<div id=\"foo\"></div>']);

      assert.same(newNode.parentNode, parent);
      assert.same(parent.lastChild, newNode);
    },

    "test remove"() {
      const n = Dom.h({div: [{id: 'a'}, {id: 'b'}]});

      n.lastChild.remove();
      assert.same(n.lastChild.id, 'a');
    },

    "test replaceChild"() {
      /**
       * Replace the `oldChild` with the `newChild`
       *
       * See [Node.replaceChild](https://developer.mozilla.org/en-US/docs/Web/API/Node/replaceChild)
       **/
      const parent = Dom.h({div: [
        {class: 'foo'},
        {class: 'old-node'},
      ]});
      const oldParent = Dom.h({div: {class: 'new-node'}});
      const newNode = oldParent.firstChild;

      const oldNode = parent.replaceChild(newNode, parent.getElementsByClassName('old-node')[0]);
      assert.className(oldNode, 'old-node');
      refute(oldNode.parentNode);
      assert.same(newNode.parentNode, parent);
      assert.same(parent.lastChild, newNode);
      assert.same(oldParent.childNodes.length, 0);
    },

    "test fragment to replaceChild"() {
      const parent = Dom.h({div: [
        {class: 'foo', div: 'f'},
        {class: 'old-node', div: 'o'},
        {class: 'bar', div: 'bar'},
      ]});
      const newNode = Dom.h(["x", "y", "z"]);

      const oldNode = parent.replaceChild(newNode, parent.getElementsByClassName('old-node')[0]);
      assert.className(oldNode, 'old-node');
      refute(oldNode.parentNode);
      assert.equals(util.map(parent.childNodes, i => i.textContent).join(''),
                    'fxyzbar');
    },

    "test setAttribute"() {
      const elm = document.createElement('div');
      elm.setAttribute('width', 500);
      assert.same(elm.getAttribute('width'), '500');
    },

    "test doc fragment cloneNode"() {
      const df1 =Dom.h(['a', 'b', 'c']);

      const df2 = df1.cloneNode();
      assert.same(df2.childNodes.length, 0);

      const df3 = df1.cloneNode(true);
      assert.equals(util.map(df3.childNodes, i => i.textContent), ['a', 'b', 'c']);
      refute.same(df1.firstChild, df3.firstChild);
    },

    "test construction"() {
      var df = document.createDocumentFragment();

      var elm = document.createElement('div');
      elm.textContent = "hello world";

      assert.same(elm.nodeType, 1);
      assert.same(elm.nodeType, document.ELEMENT_NODE);

      var elm2 = elm.cloneNode(true);
      elm2.appendChild(document.createTextNode(' alderaan'));
      assert.same(elm.outerHTML, "<div>hello world</div>");
      assert.same(elm2.outerHTML, "<div>hello world alderaan</div>");


      var foo = document.createElement('foo');
      foo.textContent = 'bar';
      foo.setAttribute('alt', 'baz');
      foo.setAttribute('bold', 'bold');
      assert.same(foo.getAttribute('alt'), 'baz');

      elm.appendChild(foo);
      assert.same(elm.lastChild, foo);
      assert.same(foo.parentNode, elm);

      df.appendChild(elm);

      var top = document.createElement('section');

      elm.id = "top123";
      assert.same(elm.className, '');

      elm.className = "un deux trois";
      assert.same(elm.className, "un deux trois");

      top.appendChild(df);

      assert.equals(util.map(top.childNodes[0].attributes, a => a.name+':'+a.value).sort(), ['class:un deux trois', 'id:top123']);

      assert.sameHtml(top.innerHTML, '<div id="top123" class="un deux trois">hello world<foo alt="baz" bold="bold">bar</foo></div>');

      assert.same(top.textContent, 'hello worldbar');
    },

    "test comments"() {
      assert.same(document.COMMENT_NODE, 8);
      const comment = document.createComment('testing');
      assert.same(comment.nodeType, document.COMMENT_NODE);
      assert.same(comment.data, 'testing');

      const div = document.createElement('div');
      div.innerHTML = "<!-- my comment-->";

      assert.equals(div.firstChild.textContent, ' my comment');

      assert.same(div.innerHTML, "<!-- my comment-->");
    },

    "test style backgroundColor"() {
      const top = document.createElement('div');
      assert.same(top.style.backgroundColor, '');
      top.style.backgroundColor = '#ffff00';
      assert.same(top.style.backgroundColor, 'rgb(255, 255, 0)');
      assert.same(top.getAttribute('style'), 'background-color: rgb(255, 255, 0);');
      assert.equals(util.map(top.attributes, x=>`${x.name}:${x.value}`),
                    ['style:background-color: rgb(255, 255, 0);']);
    },

    "test style.cssText"() {
      var top = document.createElement('div');
      top.setAttribute('style', 'border:1px solid red;font-weight:bold;color:#ff0000');
      assert.same(top.style.color, 'rgb(255, 0, 0)');
      assert.same(top.style.fontWeight, 'bold');
      assert.same(top.style['font-weight'], 'bold');
      assert.same(top.style.getPropertyValue('font-weight'), 'bold');
      assert.same(top.style.cssText, 'border: 1px solid red; font-weight: bold; color: rgb(255, 0, 0);');
      assert.same(top.getAttribute('style'), 'border:1px solid red;font-weight:bold;color:#ff0000');
      top.style.removeProperty('border');
      top.style.fontWeight = 'normal';
      assert.same(top.getAttribute('style'), 'font-weight: normal; color: rgb(255, 0, 0);');
      top.style.textDecoration = 'underline';
      let i = 0;
      for(; i < 8; ++i) {
        if (/^text-decoration/.test(top.style.item(i)||''))
          break;
      }
      assert.match(top.style.item(i), /^text-decoration/);
      assert.same(top.getAttribute('style'), 'font-weight: normal; color: rgb(255, 0, 0); text-decoration: underline;');
      assert.same(top.style.textAlign, '');
      assert.same(top.outerHTML, '<div style="font-weight: normal; color: rgb(255, 0, 0); text-decoration: underline;"></div>');
      top.style.fontFamily = 'foo bar';

      assert.match(top.style.cssText, /^font-weight: normal; color: rgb\(255, 0, 0\); text-decoration: underline; font-family: ['"]?foo\\? bar["']?;$/);
    },

    "test insertBefore"() {
      var top = document.createElement('div');

      var b = document.createElement('b');
      top.appendChild(b);
      var i = document.createElement('i');
      top.insertBefore(i, b);
      top.insertBefore(i, b);

      var frag = document.createDocumentFragment();
      frag.appendChild(document.createElement('x1'));
      frag.appendChild(document.createElement('x2'));
      frag.appendChild(document.createElement('x3'));
      frag.appendChild(document.createElement('x4'));
      frag.appendChild(document.createElement('x5'));

      top.insertBefore(frag, b);

      assert.same(top.childNodes[2].parentNode, top);


      assert.sameHtml(util.map(top.childNodes, n=>n.tagName).join(''), 'IX1X2X3X4X5B');
    },

    "test innerHTML"() {
      var elm = document.createElement('div');
      elm.innerHTML = v.exp = `<div id="top123" class="un deux trois">
hello &lt;world&#62;<foo alt="baz" bold="bold">bar<br>baz</foo>
<style>
body>div {
  color: red;
}
</style>
<script>
if (i < 5) error("bad i");
</script>
</div>`;

      assert.same(elm.firstChild.id, "top123");
      assert.same(elm.firstChild.firstChild.textContent, '\nhello <world>');
      assert.same(elm.innerHTML, v.exp.replace(/&#62/, '&gt'));
    },

    "test HTML entities"() {
      var div = document.createElement('div');
      div.innerHTML = "&lt;&quot;&quot;&gt;&#39;&amp;&nbsp;&euro;";
      assert.same(div.firstChild.textContent, '<"">\'&\xa0\u20ac');
      assert.same(div.innerHTML, '&lt;""&gt;\'&amp;&nbsp;\u20ac');
    },
  });
});

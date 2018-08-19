define((require, exports, module)=>{
  /**
   * Server side implementation of the DOM tree.
   **/
  const Dom             = require('koru/dom');
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');

  const {inspect$} = require('koru/symbols');

  const sut = require('./html-doc');

  const assertConsistent = (node, index)=>{
    const {childNodes, parentNode} = node, len = childNodes.length;

    if (parentNode === null) {
      assert.same(node.previousSibling, null);
      assert.same(node.nextSibling, null);
    }

    if (node.previousSibling !== null) {
      assert(parentNode);
      assert.same(node.previousSibling.nextSibling, node);
      assert.same(node.previousSibling.parentNode, parentNode);
      index === undefined || assert.same(node.previousSibling, parentNode.childNodes[index-1]);
    }

    if (node.nextSibling !== null) {
      assert(parentNode);
      assert.same(node.nextSibling.previousSibling, node);
      assert.same(node.nextSibling.parentNode, parentNode);
      index === undefined ||
        assert.same(node.nextSibling, parentNode.childNodes[index+1]);
    }

    let c = node.firstChild, i = 0;
    for(; i < len; ++i, c = c.nextSibling) {
      assert.same(childNodes[i], c);
      assert(c != null, `invalid child in ${node.tagName}: ${util.inspect(node)} at ${i}`);
      assertConsistent(c, i);
    }

    assert.same(i, len);
  };


  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      document.body.textContent = '';
    });

    test("getElementsByClassName", ()=>{
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

      assertConsistent(html);

      assert.equals(html.getElementsByClassName('foo').length, 2);
      assert.equals(html.getElementsByClassName('bar').length, 1);
      assert.same(html.getElementsByClassName('bar')[0].className, 'foo bar');
    });

    test("appendChild", ()=>{
       const parent = Dom.h({div: [
        {class: 'foo'},
        {class: 'old-node'},
      ]});
      assertConsistent(parent);
      const oldParent = Dom.h({div: {id: 'node1'}});
      const newNode = oldParent.firstChild;


      assert.same(oldParent.firstChild.id, 'node1');
      assertConsistent(parent);
      assertConsistent(oldParent);

      oldParent.appendChild(Dom.h({id: 'node2'}));

      assertConsistent(parent);

      assert.same(
        parent.appendChild(newNode),
        newNode);
      assert.equals(util.map(oldParent.childNodes, n => n.outerHTML), ['<div id=\"node2\"></div>']);

      assert.same(newNode.parentNode, parent);
      assert.same(parent.lastChild, newNode);
    });

    test("remove", ()=>{
      const n = Dom.h({div: [{id: 'a'}, {id: 'b'}]});

      const lc = n.lastChild;
      lc.remove();
      assert.same(n.lastChild.id, 'a');
      assertConsistent(n);
    });

    test("replaceChild", ()=>{
      /**
       * Replace the `oldChild` with the `newChild`
       *
       * See [Node.replaceChild](https://developer.mozilla.org/en-US/docs/Web/API/Node/replaceChild)
       **/
      const parent = Dom.h({div: [
        {id: 'd1'},
        {id: 'd2'},
        {id: 'd3'},
      ]});
      const oldParent = Dom.h({div: [{id: 'o1'}, {id: 'o2'}, {id: 'o3'}]});
      const newNode = oldParent.childNodes[1];

      const oldNode = parent.replaceChild(newNode, parent.childNodes[1]);
      assert.same(oldNode.id, 'd2');
      assert.same(oldNode.parentNode, null);
      assert.same(newNode.parentNode, parent);
      assert.same(parent.childNodes[1], newNode);
      assert.same(oldParent.childNodes.length, 2);
      assertConsistent(parent);
      assertConsistent(oldParent);
      assertConsistent(oldNode);
    });

    test("fragment to replaceChild", ()=>{
      const parent = Dom.h({div: [
        {class: 'foo', div: 'f'},
        {class: 'old-node', div: 'o'},
        {class: 'bar', div: 'bar'},
      ]});
      const newNode = Dom.h(["x", "y", "z"]);

      const oldNode = parent.replaceChild(newNode, parent.getElementsByClassName('old-node')[0]);
      assert.className(oldNode, 'old-node');
      refute(oldNode.parentNode);
      assertConsistent(oldNode);
      assertConsistent(parent);
      assert.equals(util.map(parent.childNodes, i => i.textContent).join(''),
                    'fxyzbar');
    });

    test("setAttribute", ()=>{
      const elm = document.createElement('div');
      elm.setAttribute('width', 500);
      assert.same(elm.getAttribute('width'), '500');
    });

    test("setAttributeNS", ()=>{
      const elm = document.createElement('div');
      elm.setAttributeNS(Dom.XHTMLNS, 'width', 500);
      assert.same(elm.getAttribute('width'), '500');
    });

    test("doc fragment cloneNode", ()=>{
       const df1 =Dom.h(['a', 'b', 'c']);
      assertConsistent(df1);

      const df2 = df1.cloneNode();
      assert.same(df2.childNodes.length, 0);
      assertConsistent(df2);

      const df3 = df1.cloneNode(true);
      assert.equals(util.map(df3.childNodes, i => i.textContent), ['a', 'b', 'c']);
      refute.same(df1.firstChild, df3.firstChild);
      assertConsistent(df3);
    });

    test("textNode is text", ()=>{
      const node = document.createTextNode(5);
      assert.same(node.textContent, '5');
    });

    test("construction", ()=>{
      const df = document.createDocumentFragment();

      const elm = document.createElement('div');
      elm.textContent = "hello world";

      assert.same(elm.nodeType, 1);
      assert.same(elm.nodeType, document.ELEMENT_NODE);

      const elm2 = elm.cloneNode(true);
      elm2.appendChild(document.createTextNode(' alderaan'));
      assert.same(elm.outerHTML, "<div>hello world</div>");
      assert.same(elm2.outerHTML, "<div>hello world alderaan</div>");


      const foo = document.createElement('foo');
      foo.textContent = 'bar';
      foo.setAttribute('alt', 'baz');
      foo.setAttribute('bold', 'bold');
      assert.same(foo.getAttribute('alt'), 'baz');
      assertConsistent(foo);

      elm.appendChild(foo);
      assert.same(elm.lastChild, foo);
      assert.same(foo.parentNode, elm);

      df.appendChild(elm);

      const top = document.createElement('section');

      elm.id = "top123";
      assert.same(elm.className, '');

      elm.className = "un deux trois";
      assert.same(elm.className, "un deux trois");

      top.appendChild(df);

      assert.equals(util.map(top.childNodes[0].attributes, a => a.name+':'+a.value).sort(), ['class:un deux trois', 'id:top123']);

      assert.sameHtml(top.innerHTML, '<div id="top123" class="un deux trois">hello world<foo alt="baz" bold="bold">bar</foo></div>');

      assert.same(top.textContent, 'hello worldbar');
    });

    test("comments", ()=>{
      assert.same(document.COMMENT_NODE, 8);
      const comment = document.createComment('testing');
      assert.same(comment.nodeType, document.COMMENT_NODE);
      assert.same(comment.data, 'testing');

      const div = document.createElement('div');
      div.innerHTML = "<!-- my comment-->";

      assert.equals(div.firstChild.textContent, ' my comment');

      assert.same(div.innerHTML, "<!-- my comment-->");
    });

    test("style backgroundColor", ()=>{
      const top = document.createElement('div');
      assert.same(top.style.backgroundColor, '');
      top.style.backgroundColor = '#ffff00';
      assert.same(top.style.backgroundColor, 'rgb(255, 255, 0)');
      assert.same(top.getAttribute('style'), 'background-color: rgb(255, 255, 0);');
      assert.equals(util.map(top.attributes, x=>`${x.name}:${x.value}`),
                    ['style:background-color: rgb(255, 255, 0);']);
    });

    test("style.cssText", ()=>{
      const top = document.createElement('div');
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
    });

    test("insertBefore", ()=>{
      const top = document.createElement('div');

      const b = document.createElement('b');
      top.appendChild(b);
      const i = document.createElement('i');
      top.insertBefore(i, b);
      assertConsistent(top);
      top.insertBefore(i, b);
      assertConsistent(top);

      const frag = document.createDocumentFragment();
      frag.appendChild(document.createElement('x1'));
      frag.appendChild(document.createElement('x2'));
      frag.appendChild(document.createElement('x3'));
      frag.appendChild(document.createElement('x4'));
      frag.appendChild(document.createElement('x5'));

      top.insertBefore(frag, b);
      assert.same(frag.childNodes.length, 0);
      top.insertBefore(frag, b);

      assertConsistent(top);
      assert.same(top.childNodes[2].parentNode, top);
      assert.sameHtml(util.map(top.childNodes, n=>n.tagName).join(''), 'IX1X2X3X4X5B');
    });

    test("innerHTML", ()=>{
      const elm = document.createElement('div');
      const exp = elm.innerHTML = `<div id="top123" class="un deux trois">
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
      assert.same(elm.innerHTML, exp.replace(/&#62/, '&gt'));
    });

    test("HTML entities", ()=>{
      const div = document.createElement('div');
      div.innerHTML = "&lt;&quot;&quot;&gt;&#39;&amp;&nbsp;&euro;";
      assert.same(div.firstChild.textContent, '<"">\'&\xa0\u20ac');
      assert.same(div.innerHTML, '&lt;""&gt;\'&amp;&nbsp;\u20ac');
    });
  });
});

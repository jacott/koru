define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var sut = require('./rich-text');
  var util = require('koru/util');
  var Dom = require('koru/dom/base');

  var OL = 1, NEST = 2, BOLD = 3, ITALIC = 4, UL = 5, LINK = 6;

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.p = document.createElement('p');
    },

    tearDown: function () {
      v = null;
    },

    "validation": {
      "test simple": function () {
        assert(sut.isValid('code:rb\n\"a\"\ncode:rb\nb', [8, 0, 1, 48, 1, 0, 3, 8, 1, 1]));
        assert(sut.isValid(""));
        assert(sut.isValid());
        assert(sut.isValid("some\nlines"));
        refute(sut.isValid("some\nlines", []));
        assert(sut.isValid("some\nlines", [BOLD, 0, 2, 3]));
        refute(sut.isValid("some\nlines", [BOLD, 0, 2, 1]));
        refute(sut.isValid("some\nlines", [BOLD, -1, 2, 3]));
        refute(sut.isValid("some\nlines", [BOLD, 1]));
        refute(sut.isValid("some\nlines", [-1, 1]));
        refute(sut.isValid("some\nlines", 'hello'));
        refute(sut.isValid("345", NaN));
        refute(sut.isValid([1,2]));
      },


    },

    "test just text": function () {
      var doc = "Hello world";

      var html = sut.toHtml(doc, null, v.p);

      assert.same(html.outerHTML, "<p><div>Hello world</div></p>");

      assert.equals(sut.fromHtml(html), [[doc], null]);
    },

    "test div with multi-line text": function () {
      var doc = "Hello world\n\nline 2\n";

      var html = sut.toHtml(doc);

      assert.equals(inspectFrag(html), ["<div>Hello world</div>", "<div><br></div>", "<div>line 2</div>", "<div><br></div>"]);

      var arround = document.createElement('div');
      arround.appendChild(html);

      assert.equals(sut.fromHtml(arround), [doc.split('\n'), null]);
    },

    "test empty li": function () {
      var doc = "\n\n", markup = [OL, 0, 1];

      var html = sut.toHtml(doc, markup, v.p);
      assert.same(html.outerHTML, "<p><ol><li><br></li><li><br></li></ol><div><br></div></p>");

      assert.equals(sut.fromHtml(v.p), [doc.split('\n'), markup]);
    },

    "test simple": function () {
      var doc = "a\nb";
      var html = document.createElement('p');
      html.appendChild(sut.toHtml(doc));

      assert.same(html.outerHTML, "<p><div>a</div><div>b</div></p>");

      assert.equals(sut.fromHtml(html), [['a', 'b'], null]);
    },

    "test nested": function () {
      var doc = "brave\nnew\nworld\nnow", markup = [NEST, 0, 2, NEST, 0, 0, NEST, 2, 0, NEST, 1, 0];
      var html = sut.toHtml(doc, markup, v.p);
      assert.same(html.outerHTML,
                  '<p><blockquote>' +
                    '<blockquote><div>brave</div></blockquote>' +
                    '<div>new</div>' +
                    '<blockquote><div>world</div></blockquote>' +
                  '</blockquote>' +
                  '<blockquote><div>now</div></blockquote></p>');
    },

    "test inline styles": function () {
      var doc = "brave\nnew\nworld", markup = [BOLD, 0, 0, 5, ITALIC, 1, 0, 2, BOLD, 0, 2, 3, ITALIC, 1, 3, 4];
      var html = sut.toHtml(doc, markup, v.p);
      assert.same(html.outerHTML, '<p><div><b>brave</b></div><div><i>ne</i><b>w</b></div><div>wor<i>l</i>d</div></p>');
    },

    "test list and nesting": function () {
      var doc = "It´s a\nbrave\n new world now", markup = [NEST, 1, 1, BOLD, 0, 0, 5, ITALIC, 1, 5, 10];

      var html = sut.toHtml(doc, markup, v.p);

      assert.same(html.outerHTML, "<p><div>It´s a</div><blockquote><div><b>brave</b></div><div> new <i>world</i> now</div></blockquote></p>");

      assert.equals(sut.fromHtml(html), [doc.split('\n'), markup]);
    },

    "test complex": function () {
      var complex = '<div>he</div><div>-llo world<b>in <i>here</i> out</b></div><div><br></div><div>line 2</div>';
      var doc = "he\n-llo worldin here out\n\nline 2";
      var markup = [BOLD, 1, 10, 21, ITALIC, 0, 13, 17];
      var html = document.createElement('div');
      html.innerHTML = complex;
      assert.equals(sut.toHtml(doc, markup, document.createElement('div')).innerHTML, complex);
      assert.equals(sut.fromHtml(html), [doc.split('\n'), markup]);
    },

    "test special": function () {
      sut.registerLinkType({
        id: 1,
        class: "foo",
        fromHtml: function (node) {return node.getAttribute('href').replace(/_foo$/,'')},
        toHtml: function (node, ref) {
          node.setAttribute('href', ref+"_foo");
        },
      });
      test.onEnd(function () {
        sut.deregisterLinkType(1);
      });
      var html = Dom.h({div: {a: "a foo", class: "foo", $href: 'link_to_foo'}});
      assert.equals(sut.fromHtml(html), [['a foo (link_to)'], [LINK, 0, 0, 15, 1, 5]]);
      assertConvert(TH.normHTMLStr(html.outerHTML));
    },

    "test linkType": function () {
      assert.equals(sut.linkType(0), {id: 0, class: '', fromHtml: TH.match.func, toHtml: TH.match.func});
    },

    "test no javascript in link": function () {
      assertConvert('<a href="javascript:alert(123)">abc</a>', '<div><a href="alert(123)" target="_blank">abc</a></div>');
    },

    "test skips empty text": function () {
      var html = Dom.h({p: {ol: [{li: "one"}, {li: ["two", {br: ''}, document.createTextNode('')]}]}});
      var rt = sut.fromHtml(html);
      assert.equals(rt, [['one', 'two'], [1, 0, 1]]);
    },

    "test font": function () {
      assertConvert('<div>one<font face="initial">two</font>three</div>');
      assertConvert('<div>one<font face="myface">two</font>three</div>');
      assertConvert('<div>one<font face="serif">two</font>three</div>');
      assertConvert('<div>one<font face="monospace"></font>three</div>', '<div>onethree</div>');
      assertConvert('<div>one<font face="sans-serif">two</font>three</div>');
      assertConvert('<div>one<font color="#ff0000">two</font>three</div>');
      assertConvert('<div>one<font color="#ff0000" face="serif" size="4">two</font>three</div>');
    },

    "test includeTop": function () {
      var rt = sut.fromHtml(Dom.h({ol: {li: 'line'}}), {includeTop: true});
      assert.equals(rt, [['line'], [1, 0, 0]]);
    },

    "test code": function () {
      assertConvert('<pre data-lang=\"ruby\"><div><span class="k">Class</span> <span class="no">Abc</span>\n' +
                    '  <span class="k">def</span> <span class="nf">foo</span><span class="mh">(</span><span class="nv">a</span>' +
                    '<span class="mh">,</span> <span class="nv">b</span><span class="mh">)</span>\n' +
                    '     <span class="nv">a</span> <span class="o">+</span> <span class="nv">b</span>\n' +
                    '  <span class="k">end</span>\n' +
                    '<span class="k">end</span>' +
                    '</div></pre>');
      assertConvert('<pre data-lang=\"ruby\"><div><span class="k">Class</span> <span class="no">Abc</span></div></pre>');
      assertConvert('<pre data-lang="text"><div>stuff <span class="nd">var</span>\n\nfoo = <span class="s2">_bzr_</span>;\n</div></pre>');
      assertConvert('<pre data-lang=\"text\">One</pre>'+
                    '<pre data-lang=\"text\"><div><div>Two</div>two</div></pre>'+
                    '<pre data-lang=\"text\"></pre>',

                    '<pre data-lang=\"text\"><div>One</div></pre>'+
                    '<pre data-lang=\"text\"><div>Two\ntwo</div></pre>'+
                    '<pre data-lang=\"text\"><div></div></pre>');

      var p = document.createElement('p');
      p.innerHTML = '<div><div><pre>One</pre><pre>Two</pre></div><div><pre data-lang="text"></pre></div></div>';
      var rt = sut.fromHtml(p);
      assert.equals(rt, [['code:text', 'One', 'code:text', 'Two', 'code:text'], [8, 0, 1, 8, 2, 1, 8, 2, 0]]);

      assertConvert('<pre data-lang="javascript"><span class="k">var</span> foo;\n\nfoo = <span class="s2">_bzr_</span>;</pre>',
                    '<pre data-lang="javascript"><div><span class="k">var</span> foo;\n\nfoo = <span class="s2">_bzr_</span>;</div></pre>');
      assertConvert('<div><pre><ol><li>hello</li><li>wo<b>rl</b>d</li></ol></pre></div>',
                    '<pre data-lang="text"><div>hello\nworld</div></pre>');
      assertConvert('<div><pre>hello<div><br></div>new<br>world<div>now</div></pre></div>',
                    '<pre data-lang="text"><div>hello\n\nnew\nworld\nnow</div></pre>');
      assertConvert('<div>Some <code>code in</code> here</div><pre data-lang="javascript">one\ntwo\nthree</pre>',
                    '<div>Some <font face="monospace">code in</font> here</div><pre data-lang=\"javascript\"><div>one\ntwo\nthree</div></pre>');
    },

    "test multiple": function () {
      assertConvert('<ol><li>Hello</li><li>begin <a href=\"/#u/123\" target="_blank">link</a> end</li></ol>');
      assertConvert('<ol><li>Hello</li><li><a href="/#u/123" target="_blank">link</a> <br></li></ol>',
                    '<ol><li>Hello</li><li><a href=\"/#u/123\" target="_blank">link</a> </li></ol>');
      assertConvert('<ol><li>hey</li></ol><span>now</span><br><div><span><br></span></div>',
                    '<ol><li>hey</li></ol><div>now</div><div><br></div>');
      assertConvert('BREAK<br>ME', '<div>BREAK</div><div>ME</div>');
      assertConvert('<ol><li>one</li></ol><span><ul><li><span>two</span><br></li></ul></span><ol><li>three</li></ol>',
                   '<ol><li>one</li></ol><ul><li>two</li></ul><ol><li>three</li></ol>');
      assertConvert('hello<div>world</div>', '<div>hello</div><div>world</div>');
      assertConvert('<ol><li>hey</li><ol><li>now</li></ol></ol>');
      assertConvert('<b>t<i>w</i>o<br>lines</b>', '<div><b>t<i>w</i>o</b></div><div><b>lines</b></div>');
      assertConvert('<b>si<i>m</i>ple</b>', 'wrap');
      assertConvert('<ol><li>one</li></ol><ul><li>two</li></ul><ol><li>three</li></ol>');
      assertConvert('<blockquote><ul><li>one</li><ol><li>2.1</li><li>2.2</li></ol><li>TH<b><i>R</i></b>EE 3</li></ul></blockquote>');
      assertConvert('<section><section>sec<span>ti</span>on</section></section>', '<div>section</div>');
      assertConvert('<ol><li><b>hey</b></li><ol><li><b>now</b></li></ol></ol>');
      assertConvert('<div><b>Hello </b></div><div><b><i><br></i></b></div><div><b><i>dffd</i></b></div>' +
                    '<div><b><i><br></i></b></div><div><b>World</b></div>',
                    '<div><b>Hello </b></div><div><br></div><div><b><i>dffd</i></b></div><div><br></div><div><b>World</b></div>');
      assertConvert('simple', '<div>simple</div>');
      assertConvert('<div><a href="/#test" class="fuzz">test</a></div>', '<div><a href="/#test" target="_blank">test</a></div>');
      assertConvert('<div><b></b>x<i></i>y</div>', '<div>xy</div>');
      assertConvert('<div><b><i><u>three</u></i></b></div>');
      assertConvert('<div><div><b><br></b></div><div>next</div></div>', '<div><br></div><div>next</div>');
      assertConvert('<div><b>cd</b><i>gh</i></div>');
      assertConvert('<div>ab<b>cd</b>ef<i>gh</i>ih</div>');
      assertConvert('<div><b>brave</b></div><div><i>ne</i><b>w</b></div><div>wor<i>l</i>d</div>');
      assertConvert('<div>hello <a href="#/foo1" target="_blank">Foo link</a> end</div>');
      assertConvert("<ul><li>test ONE</li></ul><div><br></div>");
      assertConvert("<ol><li><br></li><li><br></li></ol>");
    },
  });

  function assertConvert(text, expect) {
    if (expect === 'wrap')
      expect = "<div>"+text+"</div>";
    else
      expect = expect || text;
    var html = document.createElement('p');
    html.innerHTML = text;
    var rt = sut.fromHtml(html);

    assert.elideFromStack.msg(function () {return rt})
      .same(TH.normHTMLStr(sut.toHtml(rt[0], rt[1], document.createElement('p')).innerHTML), expect);
  }

  function inspectFrag(frag) {
    var result = [];
    util.forEach(frag.childNodes, function (elm) {
      result.push(elm.outerHTML);
    });
    return result;
  }
});

define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var sut = require('./rich-text');
  var util = require('koru/util');
  var Dom = require('koru/dom/base');

  var OL = 1, UL = 2, NEST = 3, CODE = 4, LINK = 5,
      LEFT = 6, RIGHT = 7, CENTER = 8, JUSTIFY = 9,
      MULTILINE = 10, BOLD = 11, ITALIC = 12, UNDERLINE = 13,
      FONT = 14, BGCOLOR = 15, COLOR = 16, SIZE = 17,
      LI = 20;


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
        assert(sut.isValid("some\nlines", [BOLD, 0, 2, 3]));
        assert(sut.isValid(""));
        assert(sut.isValid());
        assert(sut.isValid("some\nlines"));
        refute(sut.isValid("some\nlines", []));
        refute(sut.isValid("some\nlines", [BOLD, 0, 2, 1]));
        refute(sut.isValid("some\nlines", [BOLD, -1, 2, 3]));
        refute(sut.isValid("some\nlines", [BOLD, 1]));
        refute(sut.isValid("some\nlines", [-1, 1]));
        refute(sut.isValid("some\nlines", 'hello'));
        refute(sut.isValid("345", NaN));
        refute(sut.isValid([1,2]));
        assert(sut.isValid('code:rb\n"a"\ncode:rb\nb', [CODE, 0, 1, 48, OL, 0, 3, CODE, 1, 1]));
      },
    },

    "test fontType": function () {
      sut.mapFontNames({cursive: 'foo-face'});
      assert.same(sut.fontType(0), 'sans-serif');
      assert.same(sut.fontType("5"), 'cursive');
      assert.same(sut.fontType(5), 'cursive');
      assert.same(sut.fontType("cursive"), 'cursive');
      assert.same(sut.fontType("foo-face"), 'cursive');
      assert.same(sut.fontType("serif"), 'serif');
      assert.same(sut.fontType(""), 'sans-serif');
    },

    "test just text": function () {
      var doc = "Hello world";

      var html = sut.toHtml(doc, null, v.p);

      assert.same(html.outerHTML, "<p><div>Hello world</div></p>");

      assert.equals(sut.fromHtml(html), [doc, null]);
    },

    "test fragment": function () {
      var rt = sut.fromHtml(Dom.h([{b: 'foo'}, ' bar']));
      assert.equals(rt, ['foo bar', [11, 0, 0, 3]]);
    },

    "test div with multi-line text": function () {
      var doc = "Hello world\n\nline 2\n";

      var html = sut.toHtml(doc);

      assert.equals(inspectFrag(html), ["<div>Hello world</div>", "<div><br></div>", "<div>line 2</div>", "<div><br></div>"]);

      var arround = document.createElement('div');
      arround.appendChild(html);

      assert.equals(sut.fromHtml(arround), [doc, null]);
    },

    "test empty li": function () {
      var doc = "\n\n", markup = [OL, 0, 1, LI, 0, 0, LI, 1, 0];

      var html = sut.toHtml(doc, markup, v.p);
      assert.same(html.outerHTML, "<p><ol><li><br></li><li><br></li></ol><div><br></div></p>");

      assert.equals(sut.fromHtml(v.p), [doc, markup]);
    },

    "test simple": function () {
      var doc = "a\nb";
      var html = document.createElement('p');
      html.appendChild(sut.toHtml(doc));

      assert.same(html.outerHTML, "<p><div>a</div><div>b</div></p>");

      assert.equals(sut.fromHtml(html), ['a\nb', null]);
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
      var doc = "brave\nnew\nworld", markup = [BOLD, 0, 0, 5, ITALIC, 1, 0, 2, BOLD, 0, 2, 3, UNDERLINE, 1, 3, 4];
      var html = sut.toHtml(doc, markup, v.p);
      assert.same(html.outerHTML, '<p><div><span style="font-weight: bold;">brave</span></div><div>'+
                  '<span style="font-style: italic;">ne</span><span style="font-weight: bold;">w</span></div>'+
                  '<div>wor<span style="text-decoration: underline;">l</span>d</div></p>');
    },

    "test list and nesting": function () {
      var doc = "It´s a\nbrave\n new world now", markup = [NEST, 1, 1, BOLD, 0, 0, 5, ITALIC, 1, 5, 10];

      var html = sut.toHtml(doc, markup, v.p);

      assert.same(html.outerHTML, '<p><div>It´s a</div><blockquote><div><span style="font-weight: bold;">brave</span></div><div> new <span style="font-style: italic;">world</span> now</div></blockquote></p>');

      assert.equals(sut.fromHtml(html), [doc, markup]);
    },

    "test complex": function () {
      var complex = '<div>he</div><div>-llo world<span style="font-weight: bold;">in <span style="font-style: italic;">here</span>'+
            ' out</span></div><div><br></div><div>line 2</div>';
      var doc = "he\n-llo worldin here out\n\nline 2";
      var markup = [BOLD, 1, 10, 21, ITALIC, 0, 13, 17];
      var html = document.createElement('div');
      html.innerHTML = complex;
      assert.equals(sut.toHtml(doc, markup, document.createElement('div')).innerHTML, complex);
      assert.equals(sut.fromHtml(html), [doc, markup]);
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
      assert.equals(sut.fromHtml(html), ['a foo (link_to)', [LINK, 0, 0, 15, 1, 5]]);
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
      assert.equals(rt, ['one\ntwo', [OL, 0, 1, LI, 0, 0, LI, 1, 0]]);
    },

    "test font": function () {
      sut.mapFontNames({cursive: 'foo-face'});

      assertBothConvert('<div>one<font color="#ff0000" face="foo-face" size="4">two</font>three</div>',
                        '<div>one<span style="font-family: foo-face; color: rgb(255, 0, 0); font-size: 1.2em;">two</span>three</div>');

      assertConvert('<div><span style="font-family: foo-face;">two</span></div>');
      assert.equals(sut.fromHtml(Dom.h({div: {font: 'foo', $face: 'foo-face'}})), ['foo', [FONT, 0, 0, 3, 5]]);
      assertBothConvert('<div>one<font color="#ff0000">two</font>three</div>',
                        '<div>one<span style="color: rgb(255, 0, 0);">two</span>three</div>');
      assertBothConvert('<div>one<font face="initial">two</font>three</div>',
                        '<div>one<span style="font-family: initial;">two</span>three</div>');
      assertBothConvert('<div>one<font face="myface">two</font>three</div>',
                        '<div>one<span style="font-family: myface;">two</span>three</div>');
      assertBothConvert('<div>one<font face="serif">two</font>three</div>',
                        '<div>one<span style="font-family: serif;">two</span>three</div>');
      assertConvert('<div>one<font face="monospace"></font>three</div>', '<div>onethree</div>');
      assertBothConvert('<div>one<font face="sans-serif">two</font>three</div>',
                        '<div>one<span style="font-family: sans-serif;">two</span>three</div>');
      assertBothConvert('<div><font face="foo-face">two</font></div>',
                        '<div><span style="font-family: foo-face;">two</span></div>');
    },

    "test alignment": function () {
      assertConvert('<div align="right">foo</div>',
                    '<div style="text-align: right;">foo</div>');
      assertBothConvert('<div style="text-align: right;"><ol><li>a</li><li>b</li></ol></div>',
                        '<ol><li><div style=\"text-align: right;\">a</div></li><li><div style=\"text-align: right;\">b</div></li></ol>');
      assertBothConvert('<div style="text-align: center;"><ol><li>foo</li></ol></div>',
                        '<ol><li><div style="text-align: center;">foo</div></li></ol>');
      assertBothConvert('<div><ol style="text-align: justify;"><li>abc</li><li><br></li></ol></div>',
                        '<ol><li><div style="text-align: justify;">abc</div></li><li><div style="text-align: justify;"><br></div></li></ol>');
      assertConvert('<div style="text-align: left;"><ol><li>abc</li></ol></div>',
                    '<ol><li><div style=\"text-align: left;\">abc</div></li></ol>');
      assertConvert('<div style="text-align: justify;">hello</div><div style="text-align: left;">world</div>');
      assertConvert('<blockquote><div style="text-align: right;">one</div></blockquote>');
      assertBothConvert('<blockquote><div style="text-align:center;">one<br>two</div></blockquote>',
                        '<blockquote><div style="text-align: center;">one</div><div style="text-align: center;">two</div></blockquote>');
    },

    "test hiliteColor": function () {
      assertConvert('<div>one<span style="background-color:#ffff00">two</span>three</div>',
                    '<div>one<span style="background-color: rgb(255, 255, 0);">two</span>three</div>');
    },

    "test includeTop": function () {
      var rt = sut.fromHtml(Dom.h({ol: {li: 'line'}}), {includeTop: true});
      assert.equals(rt, ['line', [OL, 0, 0, LI, 0, 0]]);
    },

    "test code": function () {
      assertBothConvert('<ol><li><div>one</div><pre data-lang="text"><div>foo</div></pre></li></ol>',
                        '<ol><li>one<pre data-lang=\"text\"><div>foo</div></pre></li></ol>');
      assertConvert('<pre data-lang="text"><div><br></div></pre>');

      var p = document.createElement('p');
      p.innerHTML = '<div><div><pre>One</pre><pre>Two</pre></div><div><pre data-lang="text"></pre></div></div>';
      var rt = sut.fromHtml(p);
      assert.equals(rt, ['code:text\nOne\ncode:text\nTwo\ncode:text', [CODE, 0, 1, CODE, 2, 1, CODE, 2, 0]]);

      assertConvert('<pre data-lang="ruby"><div><span class="k">Class</span> <span class="no">Abc</span>\n' +
                    '  <span class="k">def</span> <span class="nf">foo</span><span class="mh">(</span><span class="nv">a</span>' +
                    '<span class="mh">,</span> <span class="nv">b</span><span class="mh">)</span>\n' +
                    '     <span class="nv">a</span> <span class="o">+</span> <span class="nv">b</span>\n' +
                    '  <span class="k">end</span>\n' +
                    '<span class="k">end</span>' +
                    '</div></pre>');
      assertConvert('<pre data-lang="ruby"><div><span class="k">Class</span> <span class="no">Abc</span></div></pre>');
      assertConvert('<pre data-lang="text"><div>stuff <span class="nd">var</span>\n\nfoo = <span class="s2">_bzr_</span>;\n</div></pre>');
      assertConvert('<pre data-lang="text">One</pre>'+
                    '<pre data-lang="text"><div><div>Two</div>two</div></pre>'+
                    '<pre data-lang="text"></pre>',

                    '<pre data-lang="text"><div>One</div></pre>'+
                    '<pre data-lang="text"><div>Two\ntwo</div></pre>'+
                    '<pre data-lang="text"><div></div></pre>');


      assertBothConvert('<pre data-lang="javascript"><span class="k">var</span> foo;\n\nfoo = <span class="s2">_bzr_</span>;</pre>',
                        '<pre data-lang="javascript"><div><span class="k">var</span> foo;\n\nfoo = <span class="s2">_bzr_</span>;</div></pre>');
      assertBothConvert('<div><pre><ol><li>hello</li><li>wo<b>rl</b>d</li></ol></pre></div>',
                        '<pre data-lang="text"><div>hello\nworld</div></pre>');
      assertBothConvert('<div><pre>hello<div><br></div>new<br>world<div>now</div></pre></div>',
                        '<pre data-lang="text"><div>hello\n\nnew\nworld\nnow</div></pre>');
      assertBothConvert('<div>Some <code>code in</code> here</div><pre data-lang="javascript">one\ntwo\nthree</pre>',
                        '<div>Some <span style="font-family: monospace;">code in</span> here</div>'+
                        '<pre data-lang="javascript"><div>one\ntwo\nthree</div></pre>');
    },

    "test nested links": function () {
      var html = Dom.h({div: {a: {a: 'text', $href: "/2"}, $href: "/1"}});

      var rt = sut.fromHtml(html);
      assert.equals(rt, ['text (/1)', [5, 0, 0, 9, 0, 4]]);
    },

    "test paste from other editors": function () {
      assertConvert('<div><meta http-equiv="content-type" content="text/html; charset=utf-8"><ul style="color: rgb(0, 0, 0); font-family: \'Times New Roman\'; font-size: medium; font-style: normal; font-variant: normal; font-weight: normal; letter-spacing: normal; line-height: normal; orphans: auto; text-align: start; text-indent: 0px; text-transform: none; white-space: normal; widows: 1; word-spacing: 0px; -webkit-text-stroke-width: 0px;"><li><script>bad.code</script><p style="margin-bottom: 0cm; line-height: 16px;">Item 1</p></li><li>  \n\n\r\t   </li></ul><br class="Apple-interchange-newline"></div>',
                    '<ul><li><div style=\"text-align: left;\">Item 1</div></li></ul><li><br></li>');
    },

    "test multiple": function () {
      sut.mapFontNames({poster: 'foo font'});

      assertConvert('<div><span style="font-weight:normal;font-style:normal;text-decoration:line-through;">text</span></div>',
                    '<div>text</div>');

      assertBothConvert('<div style="text-align: right;">Hello<span style="line-height: 1.2em;">&nbsp;</span>'+
                        '<a href="/foo" style="line-height: 1.2em; text-align: left;">world</a></div>',
                        '<div style="text-align: right;">Hello&nbsp;<a href="/foo">world</a></div>');
      assertConvert('<ol><li>Hello</li><li>begin <a href="/#u/123">link</a> end</li></ol>');
      assertBothConvert('<ol><li>one</li></ol><span><ul><li><span>two</span><br></li></ul></span><ol><li>three</li></ol>',
                        '<ol><li>one</li></ol><ul><li>two</li></ul><ol><li>three</li></ol>');
      assertBothConvert('<div><span style="font-family: \'foo font\'; font-weight: bold; text-decoration: underline; '+
                        'font-style: italic; font-size: large; color: rgb(255, 128, 0); '+
                        'background-color: rgb(0, 0, 255);">hello world</span></div>',
                        '<div><span style="font-family: \'foo font\'; font-weight: bold; text-decoration: underline; '+
                        'font-style: italic; font-size: 1.2em; color: rgb(255, 128, 0); '+
                        'background-color: rgb(0, 0, 255);">hello world</span></div>');
      assertConvert('<ol><li>Hello</li><li><a href="http://x/#u/123" target="_blank">link</a> <br></li></ol>',
                    '<ol><li>Hello</li><li><a href="http://x/#u/123" target="_blank">link</a></li></ol>');
      assertConvert('<ol><li>hey</li></ol><span>now</span><br><div><span><br></span></div>',
                    '<ol><li>hey</li></ol><div>now</div><div><br></div>');
      assertConvert('BREAK<br>ME', '<div>BREAK</div><div>ME</div>');
      assertConvert('hello<div>world</div>', '<div>hello</div><div>world</div>');
      assertConvert('<ol><li>hey</li><ol><li>now</li></ol></ol>');
      assertBothConvert('<b>t<i>w</i>o<br>lines</b>',
                        '<div><span style="font-weight: bold;">t<span style="font-style: italic;">w</span>o</span></div>'+
                        '<div><span style="font-weight: bold;">lines</span></div>');
      assertBothConvert('<b>si<i>m</i>ple</b>',
                        '<div><span style="font-weight: bold;">si<span style="font-style: italic;">m</span>ple</span></div>');
      assertConvert('<ol><li>one</li></ol><ul><li>two</li></ul><ol><li>three</li></ol>');
      assertConvert('<blockquote><ul><li>one</li><ol><li>2.1</li><li>2.2</li></ol><li>TH<b><i>R</i></b>EE 3</li></ul></blockquote>',
                    '<blockquote><ul><li>one</li><ol><li>2.1</li><li>2.2</li></ol><li>TH<span style="font-weight: bold;">'+
                    '<span style="font-style: italic;">R</span></span>EE 3</li></ul></blockquote>');
      assertConvert('<section><section>sec<span>ti</span>on</section></section>', '<div>section</div>');
      assertBothConvert('<ol><li><b>hey</b></li><ol><li><b>now</b></li></ol></ol>',
                        '<ol><li><span style="font-weight: bold;">hey</span></li><ol><li>'+
                        '<span style="font-weight: bold;">now</span></li></ol></ol>');
      assertBothConvert('<div><b>Hello </b></div><div><b><i><br></i></b></div><div><b><i>dffd</i></b></div>' +
                        '<div><b><i><br></i></b></div><div><b>World</b></div>',
                        '<div><span style="font-weight: bold;">Hello </span></div><div><br></div><div>'+
                        '<span style="font-weight: bold;"><span style="font-style: italic;">dffd</span></span>'+
                        '</div><div><br></div><div><span style="font-weight: bold;">World</span></div>');
      assertConvert('   simple \t\t\ntext\n\n\n', '<div> simple text </div>');
      assertConvert('<div><a href="/#test" class="fuzz">test</a></div>', '<div><a href="/#test">test</a></div>');
      assertConvert('<div><b></b>x<i></i>y</div>', '<div>xy</div>');
      assertConvert('<div><b><i><u>three</u></i></b></div>',
                    '<div><span style="font-weight: bold;"><span style="font-style: italic;">'+
                    '<span style="text-decoration: underline;">three</span></span></span></div>');
      assertConvert('<div><div><b><br></b></div><div>next</div></div>', '<div><br></div><div>next</div>');
      assertBothConvert('<div><b>brave</b></div><div><i>ne</i><b>w</b></div><div>wor<i>l</i>d</div>',
                        '<div><span style="font-weight: bold;">brave</span></div><div>'+
                        '<span style="font-style: italic;">ne</span><span style="font-weight: bold;">w</span></div>'+
                        '<div>wor<span style="font-style: italic;">l</span>d</div>');
      assertConvert('<div>hello <a href="#/foo1">Foo link</a> end</div>');
      assertConvert("<ul><li>test ONE</li></ul><div><br></div>");
      assertConvert("<ol><li><br></li><li><br></li></ol>");
    },
  });

  function assertConvert(text, expect) {
    expect = expect || text;
    var html = document.createElement('p');
    html.innerHTML = text;
    var rt = sut.fromHtml(html);

    assert.elideFromStack.msg(function () {return rt})
      .same(TH.normHTMLStr(sut.toHtml(rt[0], rt[1], document.createElement('p')).innerHTML).replace(/\&quot;/g, "'"), expect);
  }

  function assertBothConvert(text, expect) {
    assertConvert(text, expect);
    assertConvert(expect);
  }

  function inspectFrag(frag) {
    var result = [];
    util.forEach(frag.childNodes, function (elm) {
      result.push(elm.outerHTML);
    });
    return result;
  }
});

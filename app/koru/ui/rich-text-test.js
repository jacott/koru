define((require, exports, module)=>{
  'use strict';
  const Dom             = require('koru/dom/base');
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');

  const sut  = require('./rich-text');

  const OL = 1, UL = 2, NEST = 3, CODE = 4, LINK = 5,
        LEFT = 6, RIGHT = 7, CENTER = 8, JUSTIFY = 9,
        MULTILINE = 10, BOLD = 11, ITALIC = 12, UNDERLINE = 13,
        FONT = 14, BGCOLOR = 15, COLOR = 16, SIZE = 17,
        LI = 20;

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    let para;
    beforeEach( ()=>{
      para = document.createElement('p');
    });

    group("validation", ()=>{
      test("simple",  ()=>{
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
      });
    });

    test("fontType",  ()=>{
      sut.mapFontNames({cursive: 'foo-face'});
      assert.same(sut.fontType(0), 'sans-serif');
      assert.same(sut.fontType("5"), 'cursive');
      assert.same(sut.fontType(5), 'cursive');
      assert.same(sut.fontType("cursive"), 'cursive');
      assert.same(sut.fontType("foo-face"), 'cursive');
      assert.same(sut.fontType("serif"), 'serif');
      assert.same(sut.fontType(""), 'sans-serif');
    });

    test("just text",  ()=>{
      const doc = "Hello world";

      const html = sut.toHtml(doc, null, para);

      assert.same(html.outerHTML, "<p><div>Hello world</div></p>");

      assert.equals(sut.fromHtml(html), [doc, null]);
    });

    test("fragment",  ()=>{
      const rt = sut.fromHtml(Dom.h([{b: 'foo'}, ' bar']));
      assert.equals(rt, ['foo bar', [11, 0, 0, 3]]);
    });

    test("div with multi-line text",  ()=>{
      const doc = "Hello world\n\nline 2\n";

      const html = sut.toHtml(doc);

      assert.equals(inspectFrag(html), [
        "<div>Hello world</div>", "<div><br></div>", "<div>line 2</div>", "<div><br></div>"]);

      const arround = document.createElement('div');
      arround.appendChild(html);

      assert.equals(sut.fromHtml(arround), [doc, null]);
    });

    test("empty li",  ()=>{
      const doc = "\n\n", markup = [OL, 0, 1, LI, 0, 0, LI, 1, 0];

      const html = sut.toHtml(doc, markup, para);
      assert.same(html.outerHTML, "<p><ol><li><br></li><li><br></li></ol><div><br></div></p>");

      assert.equals(sut.fromHtml(para), [doc, markup]);
    });

    test("simple",  ()=>{
      const doc = "a\nb";
      const html = document.createElement('p');
      html.appendChild(sut.toHtml(doc));

      assert.same(html.outerHTML, "<p><div>a</div><div>b</div></p>");

      assert.equals(sut.fromHtml(html), ['a\nb', null]);
    });

    test("nested",  ()=>{
      const doc = "brave\nnew\nworld\nnow", markup = [NEST, 0, 2, NEST, 0, 0, NEST, 2, 0, NEST, 1, 0];
      const html = sut.toHtml(doc, markup, para);
      assert.same(html.outerHTML,
                  '<p><blockquote>' +
                    '<blockquote><div>brave</div></blockquote>' +
                    '<div>new</div>' +
                    '<blockquote><div>world</div></blockquote>' +
                  '</blockquote>' +
                  '<blockquote><div>now</div></blockquote></p>');
    });

    test("headers", ()=>{
      const json = {
        ol: {
          li: [
            {h1: 'heading 1'},
            {h5: ['heading ', {style: 'font-style: italic;', span: '2'}]},
            {div: [
              {style: 'font-weight: bold;', span: 'the'},
              ' para']}]}};

      const mu = sut.fromHtml(Dom.h(json));

      const html = sut.toHtml(...mu);

      assert.equals({ol: Dom.htmlToJson(html)[0]}, json);
    });

    test("strike-through", ()=>{
      const json = {
        div: ['a', {s: 'b'}, 'c', {style: 'text-decoration: underline line-through;', span: 'd'}]};

      const mu = sut.fromHtml(Dom.h(json));

      const html = sut.toHtml(...mu);

      assert.equals(Dom.htmlToJson(html), [{
        div: [
          'a',
          {style: 'text-decoration: line-through;', span: 'b'},
          'c',
          {style: 'text-decoration: underline line-through;', span: 'd'},
        ]}]);
    });

    test("inline styles",  ()=>{
      const doc = "brave\nnew\nworld", markup = [BOLD, 0, 0, 5, ITALIC, 1, 0, 2, BOLD, 0, 2, 3, UNDERLINE, 1, 3, 4];
      const html = sut.toHtml(doc, markup, para);
      assert.same(html.outerHTML, '<p><div><span style="font-weight: bold;">brave</span></div><div>'+
                  '<span style="font-style: italic;">ne</span><span style="font-weight: bold;">w</span></div>'+
                  '<div>wor<span style="text-decoration: underline;">l</span>d</div></p>');
    });

    test("list and nesting",  ()=>{
      const doc = "It´s a\nbrave\n new world now", markup = [NEST, 1, 1, BOLD, 0, 0, 5, ITALIC, 1, 5, 10];

      const html = sut.toHtml(doc, markup, para);

      assert.same(html.outerHTML, '<p><div>It´s a</div><blockquote><div><span style="font-weight: bold;">brave</span></div><div> new <span style="font-style: italic;">world</span> now</div></blockquote></p>');

      assert.equals(sut.fromHtml(html), [doc, markup]);
    });

    test("complex",  ()=>{
      const complex = '<div>he</div><div>-llo world<span style="font-weight: bold;">in <span style="font-style: italic;">here</span>'+
            ' out</span></div><div><br></div><div>line 2</div>';
      const doc = "he\n-llo worldin here out\n\nline 2";
      const markup = [BOLD, 1, 10, 21, ITALIC, 0, 13, 17];
      const html = document.createElement('div');
      html.innerHTML = complex;
      assert.equals(sut.toHtml(doc, markup, document.createElement('div')).innerHTML, complex);
      assert.equals(sut.fromHtml(html), [doc, markup]);
    });

    test("special",  ()=>{
      sut.registerLinkType({
        id: 1,
        class: "foo",
        fromHtml(node) {return node.getAttribute('href').replace(/_foo$/,'')},
        toHtml(node, ref) {
          node.setAttribute('href', ref+"_foo");
        },
      });
      TH.onEnd(()=>{sut.deregisterLinkType(1)});
      const html = Dom.h({div: {a: "a foo", class: "foo", $href: 'link_to_foo'}});
      assert.equals(sut.fromHtml(html), ['a foo (link_to)', [LINK, 0, 0, 15, 1, 5]]);
      assertConvert(TH.normHTMLStr(html.outerHTML));
    });

    test("linkType",  ()=>{
      assert.equals(sut.linkType(0), {id: 0, class: '', fromHtml: TH.match.func, toHtml: TH.match.func});
    });

    test("no javascript in link",  ()=>{
      assertConvert(
        '<a href="javascript:alert(123)">abc</a>',
        '<div><a draggable="false" href="alert(123)" rel="noopener" target="_blank">abc</a></div>');
    });

    test("skips empty text",  ()=>{
      const html = Dom.h({p: {ol: [{li: "one"}, {li: ["two", {br: ''}, document.createTextNode('')]}]}});
      const rt = sut.fromHtml(html);
      assert.equals(rt, ['one\ntwo', [OL, 0, 1, LI, 0, 0, LI, 1, 0]]);
    });

    test("font",  ()=>{
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
    });

    test("alignment",  ()=>{
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
    });

    test("hiliteColor",  ()=>{
      assertConvert('<div>one<span style="background-color:#ffff00">two</span>three</div>',
                    '<div>one<span style="background-color: rgb(255, 255, 0);">two</span>three</div>');
    });

    test("includeTop",  ()=>{
      const rt = sut.fromHtml(Dom.h({ol: {li: 'line'}}), {includeTop: true});
      assert.equals(rt, ['line', [OL, 0, 0, LI, 0, 0]]);
    });

    test("code",  ()=>{
      assertBothConvert('<ol><li><div>one</div><pre data-lang="text"><div>foo</div></pre></li></ol>',
                        '<ol><li>one<pre data-lang=\"text\">foo</pre></li></ol>');
      assertConvert('<pre data-lang="text"><br></pre>');

      const p = document.createElement('p');
      p.innerHTML = '<div><div><pre>One</pre><pre>Two</pre></div><div><pre data-lang="text"></pre></div></div>';
      const rt = sut.fromHtml(p);
      assert.equals(rt, ['code:text\nOne\ncode:text\nTwo\ncode:text', [CODE, 0, 1, CODE, 2, 1, CODE, 2, 0]]);

      assertConvert('<pre data-lang="ruby"><span class="k">Class</span> <span class="no">Abc</span><br>' +
                    '  <span class="k">def</span> <span class="nf">foo</span><span class="mh">(</span><span class="nv">a</span>' +
                    '<span class="mh">,</span> <span class="nv">b</span><span class="mh">)</span><br>' +
                    '     <span class="nv">a</span> <span class="o">+</span> <span class="nv">b</span><br>' +
                    '  <span class="k">end</span><br>' +
                    '<span class="k">end</span>' +
                    '</pre>');
      assertConvert('<pre data-lang="ruby"><span class="k">Class</span> <span class="no">Abc</span></pre>');
      assertConvert('<pre data-lang="text">stuff <span class="nd">var</span><br><br>foo = <span class="s2">_bzr_</span>;<br></pre>');
      assertConvert('<pre data-lang="text">One</pre>'+
                    '<pre data-lang="text"><div><div>Two</div>two</div></pre>'+
                    '<pre data-lang="text"></pre>',

                    '<pre data-lang="text">One</pre>'+
                    '<pre data-lang="text">Two<br>two</pre>'+
                    '<pre data-lang="text"></pre>');


      assertBothConvert(
        '<pre data-lang="javascript"><span class="k">var</span> \u00A0foo;\n\nfoo = <span class="s2">_bzr_</span>;</pre>',
        '<pre data-lang="javascript"><span class="k">var</span>  foo;<br><br>foo = <span class="s2">_bzr_</span>;</pre>');
      assertBothConvert('<div><pre><ol><li>hello</li><li>wo<b>rl</b>d</li></ol></pre></div>',
                        '<pre data-lang="text">hello<br>world</pre>');
      assertBothConvert('<div><pre>hello<div><br></div>new<br>world<div>now</div></pre></div>',
                        '<pre data-lang="text">hello<br><br>new<br>world<br>now</pre>');
      assertBothConvert('<div>Some <code>code in</code> here</div><pre data-lang="javascript">one\ntwo\nthree</pre>',
                        '<div>Some <span style="font-family: monospace;">code in</span> here</div>'+
                        '<pre data-lang="javascript">one<br>two<br>three</pre>');
    });

    test("nested links",  ()=>{
      const html = Dom.h({div: {a: {a: 'text', $href: "/2"}, $href: "/1"}});

      const rt = sut.fromHtml(html);
      assert.equals(rt, ['text (/1)', [5, 0, 0, 9, 0, 4]]);
    });

    test("paste from other editors",  ()=>{
      assertConvert('<div><meta http-equiv="content-type" content="text/html; charset=utf-8"><ul style="color: rgb(0, 0, 0); font-family: \'Times New Roman\'; font-size: medium; font-style: normal; font-variant: normal; font-weight: normal; letter-spacing: normal; line-height: normal; orphans: auto; text-align: start; text-indent: 0px; text-transform: none; white-space: normal; widows: 1; word-spacing: 0px; -webkit-text-stroke-width: 0px;"><li><script>bad.code</script><p style="margin-bottom: 0cm; line-height: 16px;">Item 1</p></li><li>  \n\n\r\t   </li></ul><br class="Apple-interchange-newline"></div>',
                    '<ul><li><div style=\"text-align: left;\">Item 1</div></li></ul><li><br></li>');
    });

    test("decorations on link", ()=>{
      // assertConvert('<div><a draggable="false" href="/123"><span style=\"font-weight: bold;\">hello</span></a></div>', 'x');
      assertConvert(
        '<div><a style="font-weight:bold" draggable="false" href="/123">hello</a></div>',
        '<div><a draggable="false" href="/123"><span style=\"font-weight: bold;\">hello</span></a></div>',
      );
      assertConvert(
        '<div><a style="font-weight: bold;font-family: monospace;" draggable="false" href="/123">hello</a></div>',
        '<div><a draggable="false" href="/123"><span style=\"font-weight: bold; font-family: monospace;\">hello</span></a></div>',
      );
    });

    test("font-weight", ()=>{
      assertConvert('<span style="font-weight:700">x</span>',
                    '<div><span style=\"font-weight: bold;\">x</span></div>');
      assertConvert('<span style="font-weight:800">x</span>',
                    '<div><span style=\"font-weight: bold;\">x</span></div>');

      assertConvert('<span style="font-weight:600">x</span>',
                    '<div>x</div>');
      assertConvert('<span style="font-weight:bold">x</span>',
                    '<div><span style=\"font-weight: bold;\">x</span></div>');
    });

    test("multiple",  ()=>{
      sut.mapFontNames({poster: 'foo font'});

      assertConvert('<div><span style="font-weight:normal;font-style:normal;text-decoration:line-through;">text</span></div>',
                    '<div><span style=\"text-decoration: line-through;\">text</span></div>');

      assertBothConvert(
        '<div style="text-align: right;">Hello<span style="line-height: 1.2em;">&nbsp;</span>'+
          '<a href="/foo" style="line-height: 1.2em; text-align: left;">world</a></div>',
        '<div style="text-align: right;">Hello&nbsp;<a draggable="false" href="/foo">world</a></div>');
      assertConvert(
        '<ol><li>Hello</li><li>begin <a draggable="false" href="/#u/123">link</a> end</li></ol>');
      assertBothConvert('<ol><li>one</li></ol><span><ul><li><span>two</span><br></li></ul></span><ol><li>three</li></ol>',
                        '<ol><li>one</li></ol><ul><li>two</li></ul><ol><li>three</li></ol>');
      assertBothConvert('<div><span style="font-family: \'foo font\'; font-weight: bold; text-decoration: underline; '+
                        'font-style: italic; font-size: large; color: rgb(255, 128, 0); '+
                        'background-color: rgb(0, 0, 255);">hello world</span></div>',
                        '<div><span style="font-family: \'foo font\'; font-weight: bold; text-decoration: underline; '+
                        'font-style: italic; font-size: 1.2em; color: rgb(255, 128, 0); '+
                        'background-color: rgb(0, 0, 255);">hello world</span></div>');
      assertConvert(
        '<ol><li>Hello</li><li><a href="http://x/#u/123" rel="noopener" target="_blank">link</a> <br></li></ol>',
        '<ol><li>Hello</li><li><a draggable="false" href="http://x/#u/123" rel="noopener" target="_blank">link</a></li></ol>');
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
      assertConvert(
        '<div><a draggable="false" href="/#test" class="fuzz">test</a></div>',
        '<div><a draggable="false" href="/#test">test</a></div>');
      assertConvert('<div><b></b>x<i></i>y</div>', '<div>xy</div>');
      assertConvert('<div><b><i><u>three</u></i></b></div>',
                    '<div><span style="font-weight: bold;"><span style="font-style: italic;">'+
                    '<span style="text-decoration: underline;">three</span></span></span></div>');
      assertConvert('<div><div><b><br></b></div><div>next</div></div>', '<div><br></div><div>next</div>');
      assertBothConvert('<div><b>brave</b></div><div><i>ne</i><b>w</b></div><div>wor<i>l</i>d</div>',
                        '<div><span style="font-weight: bold;">brave</span></div><div>'+
                        '<span style="font-style: italic;">ne</span><span style="font-weight: bold;">w</span></div>'+
                        '<div>wor<span style="font-style: italic;">l</span>d</div>');
      assertConvert(
        '<div>hello <a draggable="false" href="#/foo1">Foo link</a> end</div>');
      assertConvert("<ul><li>test ONE</li></ul><div><br></div>");
      assertConvert("<ol><li><br></li><li><br></li></ol>");
    });
  });

  const assertConvert = (text, expect)=>{
    expect = expect || text;
    const html = document.createElement('p');
    html.innerHTML = text;
    const rt = sut.fromHtml(html);

    assert.elide(()=>{
      assert.msg(()=> rt).equals(
        TH.normHTMLStr(sut.toHtml(rt[0], rt[1], document.createElement('p')).innerHTML)
          .replace(/\&quot;/g, "'"), expect);
    });
  };

  const assertBothConvert = (text, expect)=>{
    assertConvert(text, expect);
    assertConvert(expect);
  };

  const inspectFrag = frag=>{
    const result = [];
    util.forEach(frag.childNodes, elm =>{result.push(elm.outerHTML)});
    return result;
  };
});

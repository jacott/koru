define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var sut = require('./rich-text');
  var util = require('koru/util');
  var Dom = require('../dom-base');

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
      var html = Dom.h({div: {a: "a foo", $contenteditable: true, class: "foo", $href: 'link_to_foo'}});
      assert.equals(sut.fromHtml(html), [['a foo'], [LINK, 0, 0, 5, 1, "link_to"]]);
      assertConvert(html.outerHTML);
    },

    "test multiple": function () {
      assertConvert('simple', '<div>simple</div>');
      assertConvert('<div><b></b>x<i></i>y</div>');
      assertConvert('<div><b>cd</b><i>gh</i></div>');
      assertConvert('<div>ab<b>cd</b>ef<i>gh</i>ih</div>');
      assertConvert('<div><b>brave</b></div><div><i>ne</i><b>w</b></div><div>wor<i>l</i>d</div>');
      assertConvert('<div>hello <a contenteditable="true" href="#/foo1">Foo link</a></div>');
      assertConvert('BREAK<br>ME', '<div>BREAK</div><div>ME</div>');
      assertConvert("<ul><li>test ONE</li></ul><div><br></div>");
      assertConvert("<ol><li><br></li><li><br></li></ol>");
      assertConvert('<blockquote><ul><li>one</li><ol><li>2.1</li><li>2.2</li></ol><li>TH<b><i>R</i></b>EE 3</li></ul></blockquote>');
      assertConvert('<section><section>sec<span>ti</span>on</section></section>', '<div>section</div>');
    },
  });

  function assertConvert(text, expect) {
    expect = expect || text;
    var html = document.createElement('p');
    html.innerHTML = text;
    var rt = sut.fromHtml(html);

    assert.elideFromStack.msg(function () {return rt}).same(sut.toHtml(rt[0], rt[1], document.createElement('p')).innerHTML, expect);
  }

  function inspectFrag(frag) {
    var result = [];
    util.forEach(frag.childNodes, function (elm) {
      result.push(elm.outerHTML);
    });
    return result;
  }
});

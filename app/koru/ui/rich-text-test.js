define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var sut = require('./rich-text');
  var util = require('koru/util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },


    "test just text": function () {
      var doc = "Hello world";

      var html = sut.toHtml(doc);

      assert.same(html.textContent, "Hello world");

      assert.equals(sut.fromHtml(html), doc);
    },

    "test div with multi-line text": function () {
      var doc = "Hello world\n\nline 2\n";

      var html = sut.toHtml(doc);

      assert.equals(inspectFrag(html), ["<div>Hello world</div>", "<div><br></div>", "<div>line 2</div>", "<div><br></div>"]);

      var arround = document.createElement('div');
      arround.appendChild(html);

      assert.equals(sut.fromHtml(arround), {p: doc});
    },

    "test empty li": function () {
      var doc = {ol: [{li: ""}, {li: ""}]};

      var html = sut.toHtml(doc);
      assert.same(html.outerHTML, "<ol><li><br></li><li><br></li></ol>");
    },

    "test simple": function () {
      var doc = "a\nb";
      var html = document.createElement('p');
      html.appendChild(sut.toHtml(doc));

      assert.same(html.outerHTML, "<p><div>a</div><div>b</div></p>");

      assert.equals(sut.fromHtml(html), {p: doc});
    },

    "test list and nesting": function () {
      var doc = {p: ["Hello ", {p: {b: "brave"}}, {p: [" new ", {i: "world"}]}]};

      var html = sut.toHtml(doc);

      assert.same(html.outerHTML, "<div><div>Hello </div><div><b>brave</b></div><div> new <i>world</i></div></div>");

      assert.equals(sut.fromHtml(html), doc);
    },

    "test complex": function () {
      var complex = '<div>he</div><div>-llo world<b>in <i>here</i> out</b></div><div><br></div><div>line 2</div>';
      var doc = doc = {p: ["he", {p: ["-llo world", {b: ["in ", {i: "here"}, " out"]}]}, "\nline 2"]};
      var html = document.createElement('div');
      html.innerHTML = complex;
      assert.equals(sut.fromHtml(html), doc);
      assert.equals(sut.toHtml(doc).innerHTML, complex);
    },

    "//test classes, attrs and id": function () {
      var doc = {p: "foo", $style: "width:100px", id: "FOOID", class: "bar baz"};

      var html = sut.toHtml(doc);

      assert.same(html.outerHTML, '<p class=\"bar baz\" id=\"FOOID\" style=\"width:100px\">foo</p>');

      assert.equals(sut.fromHtml(html), doc);
    },
  });

  function inspectFrag(frag) {
    var result = [];
    util.forEach(frag.childNodes, function (elm) {
      result.push(elm.outerHTML);
    });
    return result;
  }
});

isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./rich-text-editor');
  var Dom = require('koru/dom');
  var RichTextEditorTpl = require('koru/html!./rich-text-editor-test');
  var util = require('koru/util');
  var RichText = require('./rich-text');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.tpl = Dom.newTemplate(util.deepCopy(RichTextEditorTpl));
      TH.domTearDown();
    },

    tearDown: function () {
      v = null;
    },

    "test forward/back char": function () {
      runSubTests({
        "within text node ": function () {
          this.appendChild(RichText.toHtml({p: "hello world"}));
          TH.setRange(sut.firstInnerMostNode(this),5);

          Dom.setRange(sut.select(this, 'char', 1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 5, sut.firstInnerMostNode(this), 6);

          collapse();
          Dom.setRange(sut.select(this, 'char', -1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 5, sut.firstInnerMostNode(this), 6);
        },

        "next line": function () {
           this.appendChild(RichText.toHtml({p: "hello\nworld"}));
          TH.setRange(sut.firstInnerMostNode(this),5);

          Dom.setRange(sut.select(this, 'char', 1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 5, sut.firstInnerMostNode(this.firstChild.lastChild), 0);

          collapse();
          Dom.setRange(sut.select(this, 'char', -1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 5, sut.firstInnerMostNode(this.firstChild.lastChild), 0);
        },

        "block nested": function () {
          this.appendChild(RichText.toHtml([{p: ["hello world", {b: ["in ", {i: "here"}]}]}, "\nline 2"]));
          var iElm = this.querySelector('i').firstChild;
          TH.setRange(iElm, 4);

          Dom.setRange(sut.select(this, 'char', 1));
          assert.rangeEquals(iElm, 4, this.childNodes[1], 0);

          collapse();
          Dom.setRange(sut.select(this, 'char', -1));
          assert.rangeEquals(iElm, 4, this.childNodes[1], 0);
        },

        "span nested": function () {
          this.appendChild(RichText.toHtml([{p: ["hello ", {b: ["in ", {i: "here"}, ' out']}]}, "\nline 2"]));
          TH.setRange(sut.firstInnerMostNode(this), 6);

          Dom.setRange(sut.select(this, 'char', 1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 6, sut.firstInnerMostNode(this.querySelector('b')), 1);

          collapse();
          Dom.setRange(sut.select(this, 'char', 7));
          assert.rangeEquals(sut.firstInnerMostNode(this.querySelector('b')), 1, sut.lastInnerMostNode(this.querySelector('b')), 1);

          collapse();
          Dom.setRange(sut.select(this, 'char', -7));
          assert.rangeEquals(sut.firstInnerMostNode(this.querySelector('b')), 1, sut.lastInnerMostNode(this.querySelector('b')), 1);

          collapse(true);
          Dom.setRange(sut.select(this, 'char', -1));
          assert.rangeEquals(sut.firstInnerMostNode(this.querySelector('b')), 0, sut.firstInnerMostNode(this.querySelector('b')), 1);

          collapse(true);
          Dom.setRange(sut.select(this, 'char', -1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 5, sut.firstInnerMostNode(this.querySelector('b')), 0);
        },
      });
    },

    "test typing": function () {
      document.body.appendChild(v.tpl.$autoRender({content: [
        "helo\n\n\nworld how are",
        {div: {div: [{a: "href", $href: "foo"}, {b: "bold"}]}},
        "\n\nyou", {ol: [{li: "one"},
                         {li: "two"},
                         {ol: [{li: "two,zero"}, {li: "two,one", class: "x"}, {li: "two,two"}]},
                         {li: "three"}]}
      ]}));

      Dom.flushNextFrame();

      assert.dom('.input[contenteditable=true]', function () {
        this.style.padding = '5px';
        this.style.margin = '20px';
        this.style.width = '500px';
        this.style.border = '1px solid black';
      });
    },
  });

  function collapse(start) {
    var range = Dom.getRange();
    range.collapse(start);
    Dom.setRange(range);
    return range;
  }

  function runSubTests(subTests) {
    document.body.appendChild(v.tpl.$autoRender({content: ''}));

    assert.dom('.richTextEditor .input[contenteditable=true]', function () {
      for(var name in subTests) {
        Dom.removeChildren(this);
        _koru_.debug.inspect('> ' + name);

        subTests[name].call(this);
      }
    });
  }
});

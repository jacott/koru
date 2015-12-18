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

    "test deleting range": function () {
      runSubTests({
        "single br": function () {
          this.appendChild(RichText.toHtml("\nhello"));
          var start = this.querySelector('div:nth-child(2)');
          TH.setRange(start, 0);
          var range = sut.select(this, 'char', -1);
          sut.deleteContents(this, range);
          assert(Dom.getRange().collapsed);
          assert.same(this.innerHTML, '<div>hello</div>');
        },

        "break in li": function () {
          this.appendChild(RichText.toHtml({ol: [{li: ""},
                                                 {ol: {li: "", class: 'x'}},
                                                 {li: "end"}]}));
          var start = this.querySelector('ol li:first-child');
          var end = this.querySelector('.x');
          TH.setRange(start, 0, end, 0);
          sut.deleteSelected(this);
          assert(Dom.getRange().collapsed);
          sut.insert(this, '-');
          assert.same(this.innerHTML, '<ol><li>-</li><li>end</li></ol>');
          assert.equals(RichText.fromHtml(this), {p: {ol: [{li: "-"}, {li: "end"}]}});
        },

        "lists": function () {
          this.appendChild(RichText.toHtml({ol: [{li: "one"},
                                                 {li: "two"},
                                                 {ol: [{li: "two,zero"}, {li: "two,one", class: "x"}, {li: "two,two"}]},
                                                 {li: "three"}]}));
          var start = this.querySelector('ol li:first-child').firstChild;
          var end = this.querySelector('ol ol li.x').firstChild;
          TH.setRange(start, 2, end, 4);
          sut.deleteSelected(this);
          assert(Dom.getRange().collapsed);
          sut.insert(this, '-');
          assert.same(this.innerHTML, '<ol><li>on-one</li><ol><li>two,two</li></ol><li>three</li></ol>');
          assert.equals(RichText.fromHtml(this), {p: {ol: [{li: "on-one"}, {ol: {li: "two,two"}}, {li: "three"}]}});
        },

        "inner text": function () {
          this.appendChild(RichText.toHtml({p: "hello world"}));
          TH.setRange(sut.firstInnerMostNode(this), 4, sut.firstInnerMostNode(this), 5);
          sut.deleteSelected(this);
          assert(Dom.getRange().collapsed);
          sut.insert(this, '-');
          assert.same(this.innerHTML, '<div>hell- world</div>');
          assert.equals(RichText.fromHtml(this), {p: "hell- world"});
        },

        "whole elements": function () {
          this.appendChild(RichText.toHtml("hello\nmy\nworld"));
          TH.setRange(this, 1, this, 2);
          sut.deleteSelected(this);
          assert(Dom.getRange().collapsed);
          sut.insert(this, '-');
          assert.same(this.innerHTML, '<div>hello</div><div>-world</div>');
          assert.equals(RichText.fromHtml(this), {p: "hello\n-world"});
        },

        "multi br whole elements": function () {
          this.appendChild(RichText.toHtml("hello\nmy\n\nworld"));
          TH.setRange(this, 1, this, 2);
          sut.deleteSelected(this);
          assert(Dom.getRange().collapsed);
          sut.insert(this, '-');
          assert.same(this.innerHTML, '<div>hello</div><div>-</div><div>world</div>');
          assert.equals(RichText.fromHtml(this), {p: "hello\n-\nworld"});
        },

        "mixed break": function () {
          this.appendChild(RichText.toHtml("hello\nworld"));
          TH.setRange(sut.firstInnerMostNode(this), 4, sut.firstInnerMostNode(this.childNodes[1]), 0);
          sut.deleteSelected(this);
          assert(Dom.getRange().collapsed);
          assert.rangeEquals(sut.firstInnerMostNode(this), 4);
          sut.insert(this, '-');
          assert.same(this.innerHTML, '<div>hell-world</div>');
          assert.equals(RichText.fromHtml(this), {p: "hell-world"});
        },
      });
    },

    "test breakLine": function () {
      var complex = [{p: ["hello world", {b: ["in ", {i: "here"}, " out"]}]}, "\nline 2"];

      runSubTests({
        "simple break": function () {
          this.appendChild(RichText.toHtml({p: "hello world"}));
          TH.setRange(sut.firstInnerMostNode(this),5);
          sut.breakLine(this);
          sut.insert(this, '-');
          assert.same(this.innerHTML, '<div>hello</div><div>- world</div>');
          assert.equals(RichText.fromHtml(this), {p: "hello\n- world"});
        },

        "break at end": function () {
          this.appendChild(RichText.toHtml({p: "hello world"}));
          TH.setRange(sut.firstInnerMostNode(this), 11);
          sut.breakLine(this);
          sut.insert(this, '-');
          assert.same(this.innerHTML, '<div>hello world</div><div>-</div>');
          assert.equals(RichText.fromHtml(this), {p: "hello world\n-"});
        },

        "break at start": function () {
          this.appendChild(RichText.toHtml({p: "hello world"}));
          TH.setRange(sut.firstInnerMostNode(this),0);
          sut.breakLine(this);
          assert.same(this.innerHTML, '<div><br></div><div>hello world</div>');
          assert.equals(RichText.fromHtml(this), {p: "\nhello world"});
        },

        "break at break": function () {
          this.appendChild(RichText.toHtml("\nhello world"));
          TH.setRange(this.firstChild, 0);
          sut.breakLine(this);
          assert.same(this.innerHTML, '<div><br></div><div><br></div><div>hello world</div>');
          assert.equals(RichText.fromHtml(this), {p: "\n\nhello world"});
        },

        "break on empty": function () {
          TH.setRange(this, 0);
          sut.breakLine(this);
          assert.same(this.innerHTML, '<div><br></div>');
          sut.insert(this, '-');
          assert.same(this.innerHTML, '<div>-</div>');
          assert.equals(RichText.fromHtml(this), {p: "-"});
        },

        "complex break deep": function () {
          this.appendChild(RichText.toHtml(complex));
          var iElm = this.querySelector('i').firstChild;
          TH.setRange(iElm, 2);
          sut.breakLine(this);
          sut.insert(this, '-');
          assert.same(this.innerHTML, '<div>hello world<b>in <i>he</i></b></div><div><b><i>-re</i> out</b></div><div><br></div><div>line 2</div>');
          assert.equals(RichText.fromHtml(this), {p: [{p: ["hello world", {b: ["in ", {i: "he"}]}]}, {p: {b: [{i: "-re"}, " out"]}}, "\nline 2"]});
        },

        "complex break early": function () {
          this.appendChild(RichText.toHtml(complex));
          TH.setRange(sut.firstInnerMostNode(this), 2);
          sut.breakLine(this);
          sut.insert(this, '-');
          assert.same(this.innerHTML, '<div>he</div><div>-llo world<b>in <i>here</i> out</b></div><div><br></div><div>line 2</div>');
        },
      });
    },

    "test typing": function () {
      document.body.appendChild(RichText.toHtml("hwlllll\n\n\n\nfsdfdf"));

//      document.body.appendChild(v.tpl.$autoRender({content: "helo\n\n\nworld how are\n\nyou"}));
      document.body.appendChild(v.tpl.$autoRender({content: [
        "helo\n\n\nworld how are",
        {div: {div: [{a: "href", $href: "foo"}, {b: "bold"}]}},
        "\n\nyou", {ol: [{li: "one"},
                         {li: "two"},
                         {ol: [{li: "two,zero"}, {li: "two,one", class: "x"}, {li: "two,two"}]},
                         {li: "three"}]}
      ]}));

      document.body.appendChild(RichText.toHtml("hwlllll\n\n\n\nfsdfdf"));

      Dom.flushNextFrame();

      assert.dom('.richTextEditor[contenteditable=true]', function () {
        this.style.padding = '5px';
        this.style.margin = '20px';
        this.style.width = '500px';
        this.style.border = '1px solid black';
        FIXME;

        assert.same(document.activeElement, this);

        assert.rangeEquals(this.firstChild.firstChild, 0);
        var range = Dom.getRange();

        range.setEnd(range.endContainer, 2);
        range.collapse();

        Dom.setRange(range);

        test.spy(Dom, 'stopEvent');
        TH.keydown(this, "l");
        refute.called(Dom.stopEvent);
        TH.keypress(this, "l", {charCode: 1});
        assert.called(Dom.stopEvent);

        assert.same(this.firstChild.firstChild.textContent, "hello");

        assert.rangeEquals(this.firstChild.firstChild, 3);

        Dom.stopEvent.reset();
        TH.keydown(this, "  ");
        refute.called(Dom.stopEvent);
        TH.keypress(this, "  ", {charCode: 1});
        assert.calledTwice(Dom.stopEvent);
        assert.same(this.firstChild.firstChild.textContent, "hel \u00a0lo");

        Dom.stopEvent.reset();
        TH.keydown(this, "\n-");
        refute.called(Dom.stopEvent);
        TH.keypress(this, "\n-", {charCode: 1});
        assert.calledTwice(Dom.stopEvent);
        assert.same(this.firstChild.textContent, "hel \u00a0");
        assert.same(this.childNodes[1].tagName, 'BR');
        assert.same(this.childNodes[2].textContent, '-lo');
      });
    },

    "test simple backspace": function () {
      document.body.appendChild(v.tpl.$autoRender({content: "hello\n\nworld"}));
      Dom.flushNextFrame();

      assert.dom('.richTextEditor[contenteditable=true]', function () {
        TH.setRange(this, 2);
        test.spy(Dom, 'stopEvent');
        TH.keydown(this, 8);
        assert.called(Dom.stopEvent);

        sut.insert(this, 'x');
        assert.equals(RichText.fromHtml(this), {div: 'hellox\nworld'});

        TH.keydown(this, 8);
        TH.keydown(this, 8);
        assert.equals(RichText.fromHtml(this), {div: 'hell\nworld'});

        sut.select(this, 'char', -3, 'mark').deleteContents();

        assert.equals(RichText.fromHtml(this), {div: 'h\nworld'});

        sut.select(this, 'char', -2, 'mark').deleteContents();

        assert.equals(RichText.fromHtml(this), {div: '\nworld'});
      });
    },

    "test simple DEL": function () {
      document.body.appendChild(v.tpl.$autoRender({content: "hello\n\nworld"}));
      Dom.flushNextFrame();

      assert.dom('.richTextEditor[contenteditable=true]', function () {
        TH.setRange(this, 2);
        test.spy(Dom, 'stopEvent');
        TH.keydown(this, 46);
        assert.called(Dom.stopEvent);

        sut.insert(this, 'x');
        assert.equals(RichText.fromHtml(this), {div: 'hello\nxworld'});

        TH.keydown(this, 46);
        TH.keydown(this, 46);
        assert.equals(RichText.fromHtml(this), {div: 'hello\nxrld'});

        sut.select(this, 'char', 2, 'mark').deleteContents();

        assert.equals(RichText.fromHtml(this), {div: 'hello\nxd'});

        sut.select(this, 'char', 2, 'mark').deleteContents();

        assert.equals(RichText.fromHtml(this), {div: 'hello\nx'});
      });
    },

    "test complex deleting": function () {
      document.body.appendChild(v.tpl.$autoRender({content: [{div: {div: {a: 'ref1'}}}, "hello\n\nworld", {div: {div: {a: 'ref2'}}} ]}));
      Dom.flushNextFrame();

      assert.dom('.richTextEditor[contenteditable=true]', function () {
        var aElms = this.getElementsByTagName('a');
        TH.setRange(aElms[0].firstChild, 2, aElms[1].firstChild, 3); // FIXME select forward to end pos
        TH.keydown(this, 8);

        sut.insert(this, 'x');
        assert.equals(this.innerHTML, '<div><div><a>rex</a></div></div><div><div><a>2</a></div></div>');

        TH.setRange(aElms[0].parentNode, 0, aElms[1], 1);
        TH.keydown(this, 46);

        sut.insert(this, 'x');
        assert.equals(this.innerHTML, '<div><div>x</div></div><div><div><a></a></div></div>');
      });
    },

    "test inserting between non-txt nodes": function () {
      document.body.appendChild(v.tpl.$autoRender({content: "hello\n\nworld"}));
      Dom.flushNextFrame();

      assert.dom('.richTextEditor[contenteditable=true]', function () {
        TH.setRange(this, 2);
        sut.insert(this, 'x');
        assert.same(this.childNodes[2].textContent, 'x');
        assert.rangeEquals(this.childNodes[2], 1);

        TH.setRange(this, 3);
        sut.insert(this, RichText.toHtml({a: 'ref'}));

        assert.same(this.childNodes[3].tagName, 'A');
        assert.same(this.childNodes[3].textContent, 'ref');
        sut.insert(this, 'v');

        TH.setRange(this, 3);
        sut.insert(this, RichText.toHtml("1\n2"));

        sut.insert(this, '3');

        assert.equals(RichText.fromHtml(this), {div: ['hello\nx1\n23', {a: 'ref'}, 'v\nworld']});

        TH.setRange(this, 4);

        sut.insert(this, RichText.toHtml([{a: 'ref2'}, {b: 'bold'}]));

        sut.insert(this, '4');

        assert.equals(RichText.fromHtml(this), {div: ['hello\nx1', {a: 'ref2'}, {b: 'bold'}, '4\n23', {a: 'ref'}, 'v\nworld']});
      });
    },

    "test inserting within text nodes": function () {
      document.body.appendChild(v.tpl.$autoRender({content: "helo\nworld how are\n\nyou"}));
      Dom.flushNextFrame();


      assert.dom('.richTextEditor[contenteditable=true]', function () {
        assert.same(document.activeElement, this);

        assert.rangeEquals(this.firstChild, 0);
        TH.setRange(this.firstChild, 2);

        sut.insert(this, 'l');

        assert.same(this.firstChild.textContent, "hello");

        assert.rangeEquals(this.firstChild, 3);

        assert.same(this.lastChild.textContent, 'you');

        TH.setRange(this.childNodes[2], 3, this.childNodes[2], 5);
        sut.insert(this, '');

        assert.same(this.childNodes[2].textContent, 'wor how are');
        assert.rangeEquals(this.childNodes[2], 3);

        TH.setRange(this.childNodes[0], 4, this.childNodes[2], 5);
        sut.insert(this, RichText.toHtml('a\nb'));

        assert.equals(RichText.fromHtml(this), {div: 'hella\nbow are\n\nyou'});
        assert.same(this.childNodes[1].tagName, 'BR');
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

    assert.dom('.richTextEditor[contenteditable=true]', function () {
      for(var name in subTests) {
        Dom.removeChildren(this);
        _koru_.debug.inspect('> ' + name);

        subTests[name].call(this);
      }
    });
  }
});

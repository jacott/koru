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
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "test attrs helper": function () {
      var elm = sut.$autoRender({
        content: '', options: {
          class: 'foo bar', id: 'FOO', type: 'RichTextEditor',
          placeholder: 'place holder text',
          $other: 'x', 'data-foo': 'daf',
        }
      });
      assert.dom(elm, function () {
        assert.same(this.className, 'foo bar richTextEditor');
        assert.same(this.getAttribute('$other'), null);
        assert.same(this.getAttribute('type'), null);
        assert.same(this.getAttribute('data-foo'), 'daf');
        assert.same(this.id, 'FOO');
        assert.dom('.input[placeholder="place holder text"]');
      });
    },

    "test forward/back char": function () {
      runSubTests({
        "within text node ": function () {
          this.appendChild(RichText.toHtml("hello world"));
          TH.setRange(sut.firstInnerMostNode(this),5);

          Dom.setRange(sut.select(this, 'char', 1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 5, sut.firstInnerMostNode(this), 6);

          collapse();
          Dom.setRange(sut.select(this, 'char', -1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 5, sut.firstInnerMostNode(this), 6);
        },

        "next line": function () {
          this.innerHTML = '<div><div>hello</div><div>world</div></div>';
          TH.setRange(sut.firstInnerMostNode(this),5);

          Dom.setRange(sut.select(this, 'char', 1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 5, sut.firstInnerMostNode(this.firstChild.lastChild), 0);

          collapse();
          Dom.setRange(sut.select(this, 'char', -1));
          assert.rangeEquals(sut.firstInnerMostNode(this), 5, sut.firstInnerMostNode(this.firstChild.lastChild), 0);
        },

        "block nested": function () {
          this.innerHTML = "<div><div>hello world <b>in <i>here</i></b></div></div><div>line 2</div>";
          var iElm = this.querySelector('i').firstChild;
          TH.setRange(iElm, 4);

          Dom.setRange(sut.select(this, 'char', 1));
          assert.rangeEquals(iElm, 4, this.childNodes[1].firstChild, 0);

          collapse();
          Dom.setRange(sut.select(this, 'char', -1));
          assert.rangeEquals(iElm, 4, this.childNodes[1].firstChild, 0);
        },

        "span nested": function () {
          this.innerHTML = "<div><div>hello <b>in <i>here</i> out</b></div></div><div>line 2</div>";
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

    "test bold, italic, underline": function () {
      v.ec = test.stub(document, 'execCommand');

      document.body.appendChild(v.tpl.$autoRender({content: ''}));

      assert.dom('.input', function () {
        TH.keydown(this, 'B', {ctrlKey: true});
        TH.keydown(this, 'B', {ctrlKey: false});
        assert.calledOnceWith(v.ec, 'bold');

        TH.keydown(this, 'I', {ctrlKey: true});
        assert.calledWith(v.ec, 'italic');

        TH.keydown(this, 'U', {ctrlKey: true});
        assert.calledWith(v.ec, 'underline');
      });
    },

    "paste": {
      setUp: function () {
        v.ec = test.stub(document, 'execCommand');
        v.event = {
          clipboardData: {
            types: ['text/plain', 'text/html'],
            getData: test.stub().withArgs('text/html').returns('<b>bold</b> world'),
          },
        };

        v.slot = TH.findDomEvent(sut, 'paste')[0];
        v.paste = v.slot[2];
        v.slot[2] = test.stub();
        test.stub(Dom, 'stopEvent');

        document.body.appendChild(v.tpl.$autoRender({content: ''}));

        v.input = document.body.getElementsByClassName('input')[0];
        v.insertHTML = v.ec.withArgs('insertHTML');
        v.insertText = v.ec.withArgs('insertText').returns(true);
      },

      tearDown: function () {
        if (v.slot) v.slot[2] = v.paste;
      },

      "test wiried": function () {
        TH.trigger(v.input, 'paste');

        assert.called(v.slot[2]);
      },

      "test no clipboard": function () {
        delete v.event.clipboardData;

        v.paste(v.event);

        refute.called(Dom.stopEvent);
      },

      "test no insertHTML": function () {
        v.insertHTML.returns(false);

        v.paste(v.event);

        assert.calledWith(v.insertText, 'insertText', false, 'bold world');
        assert.called(Dom.stopEvent);
      },

      "test insertHTML": function () {
        v.insertHTML.returns(true);
        v.paste(v.event);

        assert.called(Dom.stopEvent);

        refute.called(v.insertText);
        assert.calledWith(v.insertHTML, 'insertHTML', false, '<b>bold</b> world');
      },
    },

    "test typing": function () {
      document.body.appendChild(v.tpl.$autoRender({content: RichText.toHtml('hello\nworld')}));

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
    document.body.appendChild(v.tpl.$autoRender({}));

    assert.dom('.richTextEditor .input[contenteditable=true]', function () {
      for(var name in subTests) {
        Dom.removeChildren(this);
        subTests[name].call(this);
      }
    });
  }
});

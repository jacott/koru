define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var Markdown = require('./markdown');
  var Dom = require('../dom');
  var koru = require('../main');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "fromHtml": {
      setUp() {
        v.c = function (html) {
          return Markdown.fromHtml(Dom.html(html));
        };
      },

      "test null"() {
        assert.same(Markdown.fromHtml(null), '');
      },

      "test href"() {
        assert.same(v.c('<div><a href="http://vimaly.com">Vimaly <b>Limited</b></a> link</div>'),
                    '[Vimaly **Limited**](http://vimaly.com) link');

        assert.same(v.c('<div><a href="http://vimaly.com">Vimaly_Limited_link</a> click it</div>'),
                    '[Vimaly_Limited_link](http://vimaly.com) click it');

        assert.same(v.c('<div><a href="http://vimaly.com">Vimaly **Limited**</a> link</div>'),
                    '[Vimaly \\**Limited**](http://vimaly.com) link');

      },

      "test simple nesting"() {
        assert.same(v.c('<div><b>Brave <i>new</i> World</b></div>'),
                    '**Brave _new_ World**');

      },

      "test complex"() {
        assert.same(v.c("<div><b>So <i>m</i> e</b> Text<div><br></div><div>As <i>html</i>  Test</div>" +
                        "<div>ing with<br></div><div><br></div><div> spaces</div></div>"),
                    '**So _m_ e** Text\n\nAs *html*  Test\ning with\n\n spaces');
      },

      "test buttons"() {
        assert.same(v.c('<div>Hello <span data-a="j2">Josiah&lt;JG&gt;</span></div>'), 'Hello @[Josiah<JG>](j2)');
        assert.same(v.c('<div>Hello <span data-h="s1">Foo <b>bar</b></span></div>'), 'Hello #[Foo **bar**](s1)');
      },
    },

    "toHtml": {
      setUp() {
        v.c = function (text, editable) {
          var elm = document.createElement('div');
          elm.appendChild(Markdown.toHtml(text, null, editable));
          return elm.innerHTML;
        };
      },

      "test non links"() {
        // bug in prod 21 may 2015"
        assert.same(v.c("\\[x] - \\[x]@[ab](c)"), '[x] - [x]<span data-a="c">ab</span>');
      },

      "test links"() {
        assert.same(v.c('Hello @[Josiah<JG>](j2)', true).replace(/contenteditable="true" data-a="j2"/, 'data-a="j2" contenteditable="true"'),
                    'Hello <span data-a="j2" contenteditable="true">Josiah&lt;JG&gt;</span>');
        assert.same(v.c('#[Foo **bar**](s1)'),
                    '<span data-h="s1">Foo <b>bar</b></span>');
      },


      "test wrapper"() {
        assert.dom(Markdown.toHtml("hello _world_", 'span'), function () {
          assert.same(this.tagName, 'SPAN');
          assert.dom('i', "world");
        });

        assert.dom(document.createElement('pre'), function () {
          Markdown.toHtml("hello _world_", this);
          assert.dom('i', "world");
        });
      },

      "test simple italic"() {
        assert.same(v.c('*italic* text'), "<i>italic</i> text");
      },

      "test simple bold"() {
        assert.same(v.c('**bold** text'), "<b>bold</b> text");
      },

      "test nested italic in bold"() {
        assert.same(v.c('**bold _italic_ ** text'), "<b>bold <i>italic</i> </b> text");
        assert.same(v.c('__bold *italic* __ text'), "<b>bold <i>italic</i> </b> text");
      },

      "test nested bold in italic"() {
        assert.same(v.c('*italic __bold__ * text'), "<i>italic <b>bold</b> </i> text");
      },

      "test hyperlink"() {
        test.stub(koru, 'getHashOrigin').returns('http://getvimaly.comm/');
        assert.sameHtml(v.c('[l1](/l1) text [O][b\n]eya](http://vimaly.com)[link2](/a)[int](http://getvimaly.comm/#int/ernal)'),
                        '<a href="/l1" target="_blank">l1</a> text [O]'+
                        '<a href="http://vimaly.com" target="_blank">b<br>]eya</a>'+
                        '<a href="/a" target="_blank">link2</a>'+
                        '<a '+
                        (isClient ? 'href="/#int/ernal"' : 'href="http://getvimaly.comm/#int/ernal" target="_blank"')+
                        '>int</a>');
      },

      "test underscores in link text"() {
        assert.sameHtml(v.c('[Vimaly_Limited_link](http://vimaly.com) click it'),
                        '<a href="http://vimaly.com" target="_blank">Vimaly_Limited_link</a> click it');

        assert.sameHtml(v.c('[Vimaly **Limited**](http://vimaly.com) link'),
                        '<a href="http://vimaly.com" target="_blank">Vimaly <b>Limited</b></a> link');

        assert.sameHtml(v.c('[Vimaly \\**Limited**](http://vimaly.com) link'),
                        '<a href="http://vimaly.com" target="_blank">Vimaly **Limited**</a> link');
      },

      "test complex"() {
        assert.same(v.c('**So _m_ e** Text\n\nAs *html*  Test\ning with\n\n spaces'),
                    "<b>So <i>m</i> e</b> Text<div><br></div><div>As <i>html</i>  Test</div><div>ing with</div><div><br></div><div> spaces</div>");
      },
    },
  });
});

isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var Markdown = require('./markdown');
  var Dom = require('../dom');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "fromHtml": {
      setUp: function () {
        v.c = function (html) {
          return Markdown.fromHtml(Dom.html(html));
        };
      },

      "test null": function () {
        assert.same(Markdown.fromHtml(null), '');
      },

      "test href": function () {
        assert.same(v.c('<div><a href="http://obeya.co">Obeya <b>Limited</b></a> link</div>'),
                    '[Obeya **Limited**](http://obeya.co) link');

        assert.same(v.c('<div><a href="http://obeya.co">Obeya_Limited_link</a> click it</div>'),
                    '[Obeya_Limited_link](http://obeya.co) click it');

        assert.same(v.c('<div><a href="http://obeya.co">Obeya **Limited**</a> link</div>'),
                    '[Obeya \\**Limited**](http://obeya.co) link');
      },

      "test simple nesting": function () {
        assert.same(v.c('<div><b>Brave <i>new</i> World</b></div>'),
                    '**Brave _new_ World**');

      },

      "test complex": function () {
        assert.same(v.c("<div><b>So <i>m</i> e</b> Text<div><br></div><div>As <i>html</i>  Test</div>" +
                        "<div>ing with<br></div><div><br></div><div> spaces</div></div>"),
                    '**So _m_ e** Text\n\nAs *html*  Test\ning with\n\n spaces');
      },

      "test buttons": function () {
        assert.same(v.c('<div>Hello <span data-a="j2">Josiah&lt;JG&gt;</span></div>'), 'Hello @[Josiah<JG>](j2)');
        assert.same(v.c('<div>Hello <span data-h="s1">Foo <b>bar</b></span></div>'), 'Hello #[Foo **bar**](s1)');
      },
    },

    "toHtml": {
      setUp: function () {
        v.c = function (text) {
          var elm = document.createElement('div');
          elm.appendChild(Markdown.toHtml(text));
          return elm.innerHTML;
        };
      },

      "test links": function () {
        assert.same(v.c('Hello @[Josiah<JG>](j2)').replace(/contenteditable="false" data-a="j2"/, 'data-a="j2" contenteditable="false"'),
                    'Hello <span data-a="j2" contenteditable="false">Josiah&lt;JG&gt;</span>');
        assert.same(v.c('#[Foo **bar**](s1)').replace(/contenteditable="false" data-h="s1"/, 'data-h="s1" contenteditable="false"'),
                    '<span data-h="s1" contenteditable="false">Foo <b>bar</b></span>');
      },


      "test wrapper": function () {
        assert.dom(Markdown.toHtml("hello _world_", 'span'), function () {
          assert.same(this.tagName, 'SPAN');
          assert.dom('i', "world");
        });
      },

      "test simple italic": function () {
        assert.same(v.c('*italic* text'), "<i>italic</i> text");
      },

      "test simple bold": function () {
        assert.same(v.c('**bold** text'), "<b>bold</b> text");
      },

      "test nested italic in bold": function () {
        assert.same(v.c('**bold _italic_ ** text'), "<b>bold <i>italic</i> </b> text");
        assert.same(v.c('__bold *italic* __ text'), "<b>bold <i>italic</i> </b> text");
      },

      "test nested bold in italic": function () {
        assert.same(v.c('*italic __bold__ * text'), "<i>italic <b>bold</b> </i> text");
      },

      "test hyperlink": function () {
        assert.same(v.c('[l1](/l1) text [O][b\n]eya](http://obeya.co)[link2](/a)'),
                    '<a href="/l1">l1</a> text [O]<a href="http://obeya.co">b<br>]eya</a><a href="/a">link2</a>');
      },

      "test underscores in link text": function () {
        assert.same(v.c('[Obeya_Limited_link](http://obeya.co) click it'),
                    '<a href="http://obeya.co">Obeya_Limited_link</a> click it');

        assert.same(v.c('[Obeya **Limited**](http://obeya.co) link'),
                    '<a href="http://obeya.co">Obeya <b>Limited</b></a> link');

        assert.same(v.c('[Obeya \\**Limited**](http://obeya.co) link'),
                    '<a href="http://obeya.co">Obeya **Limited**</a> link');
      },

      "test complex": function () {
        assert.same(v.c('**So _m_ e** Text\n\nAs *html*  Test\ning with\n\n spaces'),
                    "<b>So <i>m</i> e</b> Text<div><br></div><div>As <i>html</i>  Test</div><div>ing with</div><div><br></div><div> spaces</div>");
      },
    },
  });
});

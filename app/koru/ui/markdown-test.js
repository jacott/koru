define((require, exports, module)=>{
  const TH              = require('koru/test-helper');
  const Dom             = require('../dom');
  const koru            = require('../main');

  const {stub, spy, onEnd} = TH;

  const Markdown = require('./markdown');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    group("fromHtml", ()=>{
      const convert = html => Markdown.fromHtml(Dom.textToHtml(html));

      test("null", ()=>{
        assert.same(Markdown.fromHtml(null), '');
      });

      test("href", ()=>{
        assert.same(convert('<div><a href="http://vimaly.com">Vimaly <b>Limited</b></a> link</div>'),
                    '[Vimaly **Limited**](http://vimaly.com) link');

        assert.same(convert('<div><a href="http://vimaly.com">Vimaly_Limited_link</a> click it</div>'),
                    '[Vimaly_Limited_link](http://vimaly.com) click it');

        assert.same(convert('<div><a href="http://vimaly.com">Vimaly **Limited**</a> link</div>'),
                    '[Vimaly \\**Limited**](http://vimaly.com) link');

      });

      test("simple nesting", ()=>{
        assert.same(convert('<div><b>Brave <i>new</i> World</b></div>'),
                    '**Brave _new_ World**');

      });

      test("complex", ()=>{
        assert.same(convert(
          "<div><b>So <i>m</i> e</b> Text<div><br></div><div>As <i>html</i>"+
            "  Test</div><div>ing with<br></div><div><br></div><div> spaces</div></div>"),
                    '**So _m_ e** Text\n\nAs *html*  Test\ning with\n\n spaces');
      });

      test("buttons", ()=>{
        assert.same(convert('<div>Hello <span data-a="j2">Josiah&lt;JG&gt;</span></div>'),
                    'Hello @[Josiah<JG>](j2)');
        assert.same(convert('<div>Hello <span data-h="s1">Foo <b>bar</b></span></div>'),
                    'Hello #[Foo **bar**](s1)');
      });
    });

    group("toHtml", ()=>{
      const convert = (text, editable)=>{
        const elm = document.createElement('div');
        elm.appendChild(Markdown.toHtml(text, null, editable));
        return elm.innerHTML;
      };

      test("non links", ()=>{
        // bug in prod 21 may 2015"
        assert.same(convert("\\[x] - \\[x]@[ab](c)"), '[x] - [x]<span data-a="c">ab</span>');
      });

      test("links", ()=>{
        assert.same(
          convert('Hello @[Josiah<JG>](j2)', true)
            .replace(/contenteditable="true" data-a="j2"/, 'data-a="j2" contenteditable="true"'),
          'Hello <span data-a="j2" contenteditable="true">Josiah&lt;JG&gt;</span>');
        assert.same(convert('#[Foo **bar**](s1)'),
                    '<span data-h="s1">Foo <b>bar</b></span>');
      });


      test("wrapper", ()=>{
        assert.dom(Markdown.toHtml("hello _world_", 'span'), function () {
          assert.same(this.tagName, 'SPAN');
          assert.dom('i', "world");
        });

        assert.dom(document.createElement('pre'), function () {
          Markdown.toHtml("hello _world_", this);
          assert.dom('i', "world");
        });
      });

      test("simple italic", ()=>{
        assert.same(convert('*italic* text'), "<i>italic</i> text");
      });

      test("simple bold", ()=>{
        assert.same(convert('**bold** text'), "<b>bold</b> text");
      });

      test("nested italic in bold", ()=>{
        assert.same(convert('**bold _italic_ ** text'), "<b>bold <i>italic</i> </b> text");
        assert.same(convert('__bold *italic* __ text'), "<b>bold <i>italic</i> </b> text");
      });

      test("nested bold in italic", ()=>{
        assert.same(convert('*italic __bold__ * text'), "<i>italic <b>bold</b> </i> text");
      });

      test("hyperlink", ()=>{
        stub(koru, 'getHashOrigin').returns('http://getvimaly.comm/');
        assert.sameHtml(convert(
          '[l1](/l1) text [O][b\n]eya](http://vimaly.com)[link2](/a)[int]'+
            '(http://getvimaly.comm/#int/ernal)'),
                        '<a href="/l1" target="_blank" rel="noopener">l1</a> text [O]'+
                        '<a href="http://vimaly.com" target="_blank" rel="noopener">b<br>]eya</a>'+
                        '<a href="/a" target="_blank" rel="noopener">link2</a>'+
                        '<a '+ (
                          isClient
                            ? 'href="/#int/ernal"'
                            : 'href="http://getvimaly.comm/#int/ernal" target="_blank" rel="noopener"'
                        )+ '>int</a>');
      });

      test("underscores in link text", ()=>{
        assert.sameHtml(
          convert('[Vimaly_Limited_link](http://vimaly.com) click it'),
          '<a href="http://vimaly.com" target="_blank" rel="noopener">Vimaly_Limited_link</a> click it');

        assert.sameHtml(
          convert('[Vimaly **Limited**](http://vimaly.com) link'),
          '<a href="http://vimaly.com" target="_blank" rel="noopener">Vimaly <b>Limited</b></a> link');

        assert.sameHtml(
          convert('[Vimaly \\**Limited**](http://vimaly.com) link'),
          '<a href="http://vimaly.com" target="_blank" rel="noopener">Vimaly **Limited**</a> link');
      });

      test("complex", ()=>{
        assert.same(
          convert('**So _m_ e** Text\n\nAs *html*  Test\ning with\n\n spaces'),
          "<b>So <i>m</i> e</b> Text<div><br></div><div>As <i>html</i>  "+
            "Test</div><div>ing with</div><div><br></div><div> spaces</div>");
      });
    });
  });
});

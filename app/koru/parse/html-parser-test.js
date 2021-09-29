define((require, exports, module) => {
  /**
   * HTML parsing helpers
   **/
  'use strict';
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  const HTMLParser = require('./html-parser');

  //--- Tag types From HTMLParser
  const RAW_TAGS = {
    script: '</script>', style: '</style>', textarea: '</textarea>', title: '</title>',
  };

  const BLOCK_TAGS = {
    address: true, article: true, aside: true, blockquote: true,
    details: true, div: true, dl: true,
    fieldset: true, figcaption: true, figure: true, footer: true, form: true,
    h1: true, h2: true, h3: true, h4: true, h5: true, h6: true,
    header: true, hgroup: true, hr: true, main: true, menu: true, nav: true,
    ol: true, p: true, pre: true, section: true, table: true, ul: true,
  };

  const DD_DT = {dd: true, dt: true}, RP_RT = {rt: true, rp: true},
        TBODY_FOOT = {tbody: true, tfoot: true};
  const NO_NEST = {
    area: true, base: true, basefont: true, br: true,
    col: true, command: true, embed: true, frame: true,
    hr: true, img: true, input: true, isindex: true, keygen: true,
    link: true, meta: true, param: true, source: true, track: true, wbr: true,

    // CODITIONAL NO_NEST
    p: BLOCK_TAGS,
    dd: DD_DT, dt: DD_DT,
    rp: RP_RT, rt: RP_RT,
    option: {option: true, optgroup: true},
    tbody: TBODY_FOOT, tfoot: TBODY_FOOT,

    // NO_SELF_NEST
    li: {li: true}, optgroup: {optgroup: true}, tr: {tr: true}, th: {th: true}, td: {td: true},
  };
  //--- end of Tag types


  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let result, texts;
    const onopentag = (name) => {result += ' >' + name},
          ontext = (c, s, e) => {texts.push(c.slice(s, e))},
          onclosetag = (name) => {result += ' <' + name};

    const assertParse = (inp, exp) => {
      result = ''; texts = [];
      try {
        HTMLParser.parse(inp, {onopentag, ontext, onclosetag});
      } catch (err) {
        koru.info(result);
        throw err;
      }

      assert.elide(() => {assert.equals(result, exp)});
    };

    test('dangling end p', () => {
      assertParse(`<p>start<pre>middle</pre>end</p>after`, ' >p <p >pre <pre >p <p');
      assert.equals(texts, ['start', 'middle', 'end', 'after']);
    });

    test('raw tags', () => {
      const parts = [];
      const ontext = (code, s, e) => {
        parts.push(code.slice(s, e));
      };

      const code = `<style>
body:before {
  content: "<b>bold</b>";
}
</style><script>
 if ( i < a && b > i) ++i;
</script>`;

      HTMLParser.parse(code, {ontext});

      assert.equals(parts, [
        `
body:before {
  content: "<b>bold</b>";
}
`, `
 if ( i < a && b > i) ++i;
`,
      ]);
    });

    test('no nest', () => {
      assertParse(`
<div>
  <input>
  <!-- I'm a comment -->
  <p>
    <b>bold</b>
  <p>
  <br>
  <span>content</span>
  <!--
    <p>
     comment 2
  -->
</div>
`, ' >div >input <input >p >b <b <p >p >br <br >span <span <p <div');

      assertParse(`
<div>
<p><b>Hello</b>
<p>Goodbye
</div>
`, ' >div >p >b <b <p >p <p <div');

      assertParse(`
<p>Hello<span>world<b>!</b></span>
<p>Goodbye</p>
`, ' >p >span >b <b <span <p >p <p');
    });

    test('parse', () => {
      /**
       * Parse a string of HTML markup calling the callbacks when matched. All callbacks are passed
       * `code`, `spos`, `epos` where `spos` and `epos` are indexes marking the correspoinding slice
       * of `code`.

       * Note: Not all markup errors will throw an exception.

       * @param code the HTML markup to parse

       * @param {string} filename A filename to use if a markup error is discovered.

       * @param onopentag called when a start tag is found.

       * `onopentag(<string> name, <object> attrs, <string> code, <int> spos, <int> epos)`

       * @param ontext called when plain text is found

       * `ontext(<string> code, <int> spos, <int> epos)`

       * @param oncomment called when a comment is found

       * `oncomment(<string> code, <int> spos, <int> epos)`

       * @param onclosetag called when a tag scope has concluded (even when no end tag)

       * `onclosetag(<string> name, <string> type, <string> code, <int> spos, <int> epos)`
       *
       * * `type` is; `end` for an end tag, `self` for self closing start tag or `missing` for no
       * end tag.

       * @throws
       **/
      api.method();
      //[
      const code = `
<div id="top" class="one two" disabled>
  <input name="title" value="
&quot;hello">
  <!-- I'm a comment -->
  <p>
    <b>bold</b>
  <p>
    <br>
    <span>content &lt;inside&gt;</span>
  <!--
    <p>
    comment 2
  -->
</div>
`;

      const mapAttrs = (attrs) => {
        let ans = '';
        for (const n in attrs)
          ans += ' ' + (attrs[n] === n ? n : `${n}="${attrs[n]}"`);
        return ans;
      };

      let result = '';
      const tags = [], comments = [];
      let level = 0;
      HTMLParser.parse(code, {
        onopentag: (name, attrs, code, spos, epos) => {
          tags.push(util.isObjEmpty(attrs) ? [++level, name] : [++level, name, attrs]);
          result += code.slice(spos, epos);
        },
        ontext: (code, spos, epos) => {
          result += code.slice(spos, epos);
        },
        oncomment: (code, spos, epos) => {
          const text = code.slice(spos, epos);
          comments.push(text);
          result += text;
        },
        onclosetag: (name, type, code, spos, epos) => {
          --level;
          tags.push(['end ' + name, type]);
          if (type === 'end') {
            result += code.slice(spos, epos);
          }
        },
      });

      assert.equals(tags, [
        [1, 'div', {id: 'top', class: 'one two', disabled: ''}],
        [2, 'input', {name: 'title', value: '\n&quot;hello'}],
        ['end input', 'self'],
        [2, 'p'],
        [3, 'b'],
        ['end b', 'end'],
        ['end p', 'missing'],
        [2, 'p'],
        [3, 'br'],
        ['end br', 'self'],
        [3, 'span'],
        ['end span', 'end'],
        ['end p', 'missing'],
        ['end div', 'end'],
      ]);
      assert.equals(comments, ["<!-- I'm a comment -->", '<!--\n    <p>\n    comment 2\n  -->']);
      assert.equals(code, result);
      //]
    });

    test('single quotes', () => {
      let attrs;
      const onopentag = (name, _attrs) => {attrs = _attrs};

      HTMLParser.parse(`<div id  =  'foo'></div>`, {onopentag});
      assert.equals(attrs, {id: 'foo'});
    });

    test('weird whitespace', () => {
      let attrs;
      const onopentag = (name, _attrs) => {attrs = _attrs};

      HTMLParser.parse(`
<br />
`, {onopentag});
      assert.equals(attrs, {});

      HTMLParser.parse(`
<div
id
  =

 "123" {{helper1 arg1 "arg2"}}/>
`, {onopentag});
      assert.equals(attrs, {id: '123', '{{helper1': true, arg1: true, '"arg2"}}': true});
    });

    test('error contents', () => {
      try {
        HTMLParser.parse('\n\nabcd</b>', {filename: 'path/for/foo.js'});
        assert.fail('expected error');
      } catch (err) {
        if (err.constructor !== HTMLParser.HTMLParseError) {
          throw err;
        }
        assert.equals(err.message, `Unexpected end tag\n\tat path/for/foo.js:3:4`);

        assert.same(err.filename, 'path/for/foo.js');
        assert.same(err.line, 3);
        assert.same(err.column, 4);
      }
    });

    test('error parsing', () => {
      const assertParseError = (code, exp) => {
        try {
          HTMLParser.parse(code);
        } catch (err) {
          if (err.name !== 'HTMLParseError') {
            throw err;
          }
          assert.elide(() => {
            assert.equals(err.message.replace(/\n[^:]+:/, ':'), exp);
          });
          return;
        }
        assert.fail('did not expect to parse', 1);
      };

      assertParseError('<noend', 'Unexpected end of input:1:6');
      assertParseError(`
<html>
  <!-- bad comment --  >
</html>
`,
                       "'--' not allow in comment:3:19");

      assertParseError(`
<html>
 <!-- bad comment ->
</html>
`,
                       'Missing end of comment:5:0');

      assertParseError(`<div id=abc>`,
                       "Expected '\"':1:8");

      assertParseError(`hello<`,
                       'Unexpected end of input:1:6');

      assertParseError(`<b>hello</b`,
                       'Unexpected end of input:1:11');
    });

    test('tag types', () => {
      assert.equals(BLOCK_TAGS, HTMLParser.BLOCK_TAGS);
      assert.equals(NO_NEST, HTMLParser[isTest].NO_NEST);
      assert.equals(RAW_TAGS, HTMLParser[isTest].RAW_TAGS);
    });
  });
});

isServer && define((require, exports, module)=>{
  'use strict';
  const HTMLParser      = require('koru/parse/html-parser');
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');

  const fs              = requirejs.nodeRequire('fs');

  const TemplateCompiler  = require('./template-compiler');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("filenameToTemplateName", ()=>{
      assert.same(TemplateCompiler.filenameToTemplateName("needUpperFirst"), "NeedUpperFirst");
      assert.same(TemplateCompiler.filenameToTemplateName("funNy-name"), "FunNyName");
    });

    test("no template", ()=>{
      const json = JSON.parse(TemplateCompiler.toJavascript("<div>hello</div>", "a/b/c/hello.html"));

      assert.equals(json, {
        name: "Hello",
        nodes: [
          {name: 'div', children: ['hello']}
        ],
      });
    });

    test("extends", ()=>{
      const fn = module.toUrl('./template-compiler-test.html');
      const code = fs.readFileSync(fn).toString();

      const json = JSON.parse(TemplateCompiler.toJavascript(code));

      assert.equals(json, {
        name: 'Test.Foo',
        nested: [{
          name: 'Bar', nodes: [{
            name: 'span',
            attrs: [['=', 'id', ['', 'join', 'korulet', '"\n           ']],
                    ['=', 'data-foo', ['', 'join', '"the', 'quick', '"brown', 'fox']]],
            children: [
              ' ', ['', 'helperName', ['=', 'foo', '"a\nb\nc\n']],
              ' some & <other>\u00a0text\n      \t',
              ['', 'h2.has.parts'], ' ']
          }]}, {
            name: 'Fnord'
          }, {
            name: 'Baz', extends: 'Fnord', ns: "http://www.w3.org/2000/svg",
            nodes: [{name: 'div'}]}],
        nodes: [{
          name: 'div',
          attrs: [
            ['=', 'id', 'Foo'], ['=', 'class', ['', 'classes']],
            ['', 'attrs'], ['', 'dotted', '.arg.has.parts', '"literal']],
          children: [
            ' ', ['>', 'Bar'], ' ', {
              name: 'svg',
              children: [
                {name:"defs",
                 children: [{
                   name: "pattern", attrs: [
                     ["=","id","image123"],["=","patternUnits","userSpaceOnUse"],
                     ["=","width","83.38"],["=","height","100"],["=","x","0"],["=","y","0"]],
                   children: [{
                     name: "image", attrs: [
                       ["=","xlink:href","http://vimaly.test/myImage.jpg"],
                       ["=","x","0"],["=","y","0"],
                       ["=","width","100%"],["=","height","100%"],
                       ["=","preserveAspectRatio","xMinYMin slice"]]
                   }]
                 }]},
                {name: 'path', attrs: [['=', 'd', 'M0,0 10,10Z']]},
                {name: 'foreignObject', children: [
                  {name: "div", ns: "http://www.w3.org/1999/xhtml"}
                ]}
              ],
            }]
        }],
      });
    });

    test("error", ()=>{
      assert.exception(()=>{
        JSON.parse(TemplateCompiler.toJavascript(`<div></section>`, 'error-example.js'));
      }, {
        constructor: HTMLParser.HTMLParseError,
        message: 'Unexpected end tag\n\tat error-example.js:1:5'});
    });
  });
});

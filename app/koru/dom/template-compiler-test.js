isServer && define((require, exports, module)=>{
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');
  const fs              = requirejs.nodeRequire('fs');

  const sut  = require('./template-compiler');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("extends", ()=>{
      const fn = module.toUrl('./template-compiler-test.html');
      const code = fs.readFileSync(fn).toString();

      const json = JSON.parse(sut.toJavascript(code));

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
            nodes: [{name: 'div', attrs: []}]}],
        nodes: [{
          name: 'div',
          attrs: [
            ['=', 'id', 'Foo'], ['=', 'class', ['', 'classes']],
            ['', 'attrs'], ['', 'dotted', '.arg.has.parts', '"literal']],
          children: [
            ' ', ['>', 'Bar'], ' ', {
              name: 'svg',
              attrs: [],
              children: [
                {name:"defs", attrs: [],
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
                {name: 'foreignObject', attrs: [], children: [
                  {name: "div", attrs: [], ns: "http://www.w3.org/1999/xhtml"}
                ]}
              ],
            }]
        }],
      });
    });
  });
});

isServer && define(function (require, exports, module) {
  var test, v;
  const TH   = require('koru/test');
  const util = require('koru/util');
  const sut  = require('./template-compiler');
  const fs   = requirejs.nodeRequire('fs');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test extends"() {
      const fn = module.toUrl('./template-compiler-test.html');
      const code = fs.readFileSync(fn).toString();

      const json = JSON.parse(sut.toJavascript(code));

      assert.equals(json, {
        name: 'Test.Foo',
        nested: [{
          name: 'Bar', nodes: [{
            name: 'span',
            attrs: [['=', 'id', ['', 'korulet']]],
            children: [
              ' ', ['', 'helperName', ['=', 'foo', '\"a\nb\nc\n']],
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
            ['', 'attrs'], ['', 'dotted', '.arg.has.parts']],
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
    },
  });
});

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
              ' ', ['', 'helperName', ['=', 'foo', '\"a\nb\nc\n']], ' ',
              ['', 'h2.has.parts'], ' ']
          }]}, {
            name: 'Fnord'
          }, {
            name: 'Baz', extends: 'Fnord', nodes: [{name: 'div', attrs: []}]}],
        nodes: [{
          name: 'div',
          attrs: [
            ['=', 'id', 'Foo'], ['=', 'class', ['', 'classes']],
            ['', 'attrs'], ['', 'dotted', '.arg.has.parts']],
          children: [
            ' ', ['>', 'Bar'], ' ', {
              name: 'svg',
              attrs: [],
              children: [{name: 'path', attrs: [['=', 'd', 'M0,0 10,10Z']]}],
            }]
        }],
      });
    },
  });
});

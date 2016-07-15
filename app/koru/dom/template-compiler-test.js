isServer && define(function (require, exports, module) {
  var test, v;
  const TH  = require('koru/test');
  const sut = require('./template-compiler');
  const fs  = requirejs.nodeRequire('fs');

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

      const Baz = json.nested.find(o => o.name === 'Baz');

      assert.same(Baz.extends, 'Fnord');
    },
  });
});

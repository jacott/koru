isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var compiler = require('./less-compiler');
  var fst = require('../fs-tools');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test compiling"() {
      compiler.compile("less", module.toUrl("./less-compiler-test.less"), module.toUrl("./.build/less-compiler-test.less.css"));

      var output = fst.readFile(module.toUrl("./.build/less-compiler-test.less.css"));

      assert.match(output, /body\s*{\s*color: #cc0000;[\s\S]*sourceMap/);
      assert.match(output, /sourceMappingURL=data:application\/json;base64/);
    },
  });
});

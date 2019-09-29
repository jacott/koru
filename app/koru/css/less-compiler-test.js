isServer && define((require, exports, module)=>{
  'use strict';
  const fst      = require('../fs-tools');
  const TH       = require('koru/test-helper');

  const compiler = require('./less-compiler');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("compiling", ()=>{
      fst.mkdir_p(module.toUrl("./.build"));
      compiler.compile("less", module.toUrl("./less-compiler-test.less"), module.toUrl("./.build/less-compiler-test.less.css"));

      const output = fst.readFile(module.toUrl("./.build/less-compiler-test.less.css"));

      assert.match(output, /body\s*{\s*color: #cc0000;[\s\S]*sourceMap/);
      assert.match(output, /sourceMappingURL=data:application\/json;base64/);
    });
  });
});

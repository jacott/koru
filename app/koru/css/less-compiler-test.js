isServer && define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test-helper');
  const fsp             = requirejs.nodeRequire('fs/promises');
  const fst             = require('../fs-tools');

  const compiler = require('./less-compiler');

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    test('compiling', async () => {
      await fst.mkdir_p(module.toUrl('./.build'));
      await compiler.compile(
        'less', module.toUrl('./less-compiler-test.less'),
        module.toUrl('./.build/less-compiler-test.less.css'));

      const output = (await fsp.readFile(module.toUrl('./.build/less-compiler-test.less.css'))).toString();

      assert.match(output, /body\s*{\s*color: #cc0000;[\s\S]*sourceMap/);
      assert.match(output, /sourceMappingURL=data:application\/json;base64/);
    });
  });
});

isServer && define((require, exports, module) => {
  'use strict';
  const Future          = require('koru/future');
  const TH              = require('koru/test');
  const child_process   = requirejs.nodeRequire('child_process');

  const {stub, spy, util} = TH;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('_debug code', async () => {
      const proc = child_process.spawn('/usr/bin/rg', [
        '--quiet',
        '--type', 'js', '-we', '_ko' + 'ru_|FIX' + 'ME|kd' + 'bg|DE' + 'BUG|de' + 'bug(ger)?',
        '.',
      ]);

      const future = new Future();
      proc.on('error', future.reject);
      proc.on('close', future.resolve);

      const code = await future.promise;
      assert(code == 1, 'code contains d\x65bug lines');
    });
  });
});

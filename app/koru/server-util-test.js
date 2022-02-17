define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const TH              = require('koru/test-helper');

  const {stub, spy, after} = TH;

  const sUtil = require('./server-util');

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    test('system', async () => {
      const ans = {stdout: 'my stdout', stderr: 'my stderr'};

      stub(sUtil, 'execFile').returns(Promise.resolve(ans));

      assert.equals(await sUtil.system('foo', 'bar'), 'my stdout');
      assert.calledWith(sUtil.execFile, 'foo', 'bar');

      ans.error = {error: 'my error'};

      stub(koru, 'error');
      await assert.exception(() => sUtil.system('cmd'), {error: 'my error'});

      assert.calledWith(koru.error, 'my stderr');
    });

    group('execFile', () => {
      test('execFile', async () => {
        const io = await sUtil.execFile('echo', '10', '20');

        assert.equals(io, {error: null, stdout: '10 20\n', stderr: ''});
      });

      test('failure', async () => {
        const io = await sUtil.execFile('date', '--badarg');

        assert.same(io.error.code, 1);
        assert.match(io.error.toString(), /unrecogni.ed option/);
        assert.match(io.stderr, /unrecogni.ed option/);
      });

      test('collecting stdout stderr', async () => {
        const io = await sUtil.execFile('bash', '-c', 'echo stdout && echo >&2 stderr && sleep 0.01 && echo more');

        assert.same(io.stdout, 'stdout\nmore\n');
        assert.same(io.stderr, 'stderr\n');
      });

      test('buffer', async () => {
        const io = await sUtil.execFile('cat', {encoding: 'buffer'}, (proc) => {
          proc.stdin.end(Buffer.from([0, 1, 2, 254, 255]));
        });

        assert.same(io.stdout.toString('hex'), '000102feff');
      });

      test('stdin', async () => {
        const io = await sUtil.execFile('cat', '-vet', (proc) => {
          proc.stdin.end('hello\tworld\n');
        });

        assert.same(io.stdout, 'hello^Iworld$\n');
      });
    });

    test('sleep', async () => {
      const date = Date.now();
      await sUtil.sleep(10);
      assert(Date.now() - date >= 9);
    });
  });
});

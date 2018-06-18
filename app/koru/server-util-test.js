define(function (require, exports, module) {
  var test, v;
  const sUtil = require('./server-util');
  const TH    = require('koru/test-helper');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "system": {
      "test simple"() {
        const io = sUtil.system('echo', '10', '20');

        assert.equals(io, {error: null, stdout: '10 20\n', stderr: ''});
      },

      "test failure"() {
        const io = sUtil.system('date', '--badarg');

        assert.same(io.error.code, 1);
        assert.match(io.error.toString(), /unrecogni.ed option/);
        assert.match(io.stderr, /unrecogni.ed option/);
      },

      "test collecting stdout stderr"() {
        const io = sUtil.system('bash', '-c', 'echo stdout && echo >&2 stderr && sleep 0.01 && echo more');

        assert.same(io.stdout, 'stdout\nmore\n');
        assert.same(io.stderr, 'stderr\n');
      },

      "test buffer"() {
        const io = sUtil.system('cat', {encoding: "buffer"}, proc => {
          proc.stdin.end(Buffer.from([0, 1, 2, 254, 255]));
        });

        assert.same(io.stdout.toString('hex'), '000102feff');
      },

      "test stdin"() {
        const io = sUtil.system('cat', '-vet', proc => {
          proc.stdin.end('hello\tworld\n');
        });

        assert.same(io.stdout, 'hello^Iworld$\n');
      },
    },

    "test sleep"() {
      var date = Date.now();
      sUtil.sleep(10);
      assert(Date.now()-date >= 9);
    },
  });
});

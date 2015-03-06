define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var sUtil = require('./server-util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test system": function () {
      v.stub = test.stub();
      sUtil.system('echo', ['10', '20'], function (data) {
        v.stub(data.toString());
      });

      assert.calledWith(v.stub, '10 20\n');
    },

    "test collecting stdout stderr": function () {
      var out = {};
      assert.same(sUtil.system('bash', ['-c', 'echo stdout && echo >&2 stderr && sleep 0.01 && echo more'], out), 0);

      assert.same(out.stdout, 'stdout\nmore\n');
      assert.same(out.stderr, 'stderr\n');
    },

    "test system stdin": function () {
      var io = {stdin: 'hello\tworld\n'};
      assert.same(sUtil.system('cat', ['-vet'], io), 0);

      assert.same(io.stdout, 'hello^Iworld$\n');
    },

    "test sleep": function () {
      var date = Date.now();
      sUtil.sleep(10);
      assert(Date.now()-date >= 9);
    },
  });
});

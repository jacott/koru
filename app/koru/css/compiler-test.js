isServer && define(function (require, exports, module) {
  var test, v;
  var core = require('../core');
  var Future = require('fibers/future');
  var geddon = require('koru/test');
  var compiler = require('./compiler');
  var fw = require('../file-watch');
  var fst = require('../fs-tools');
  var Path = require('path');

  geddon.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test compiling": function () {
      compiler.buildFile(require.toUrl("./compiler-test.less"));

      var output = fst.readFile(require.toUrl("./.build/compiler-test.less.css"));

      assert.match(output, /body\s*{\s*color: #cc0000;[\s\S]*sourceMap/);
    },

    "test queuing": function () {
      v.session = {sendAll: test.stub()};

      v.compile = fw.listeners.less;
      assert(v.compile, "Should be registered with file-watch");

      var path =  Path.resolve(require.toUrl("./compiler-test.less"));
      var top = Path.resolve(require.toUrl("."))+'/';
      var future = new Future();
      var fb1 = core.Fiber(function () {
        v.compile('less', "compiler-test.less", top, v.session);
        future.return();
      });
      fb1.run();

      var expected = {};
      expected[path] = 'compiling';

      assert.equals(compiler._queue, expected);

      v.compile('less', "compiler-test.less", top, v.session);

      expected[path] = 'redo';

      assert.equals(compiler._queue, expected);
      assert.equals(compiler._queue, expected);

      refute.called(v.session.sendAll);

      future.wait();

      var output = fst.readFile(require.toUrl("./.build/compiler-test.less.css"));

      assert.match(output, /body\s*{\s*color: #cc0000;[\s\S]*sourceMap/);

      assert.calledOnce(v.session.sendAll);
      assert.calledWith(v.session.sendAll, 'SL', 'koru/css/.build/compiler-test.less');

      assert.equals(compiler._queue, {});
    },
  });
});

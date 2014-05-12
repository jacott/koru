/*global define isClient isServer */

isServer && define(function (require, exports, module) {
  var test, v;
  var Fiber = require('fibers');
  var Future = require('fibers/future');
  var geddon = require('bart-test');
  var compiler = require('./compiler');
  var fw = require('../file-watch');
  var fst = require('../fs-tools');

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
      v.compile = fw.listeners.less;
      v.session = {sendAll: test.stub()};
      assert(v.compile);
      var path = require.toUrl("./compiler-test.less");
      var future = new Future();
      var fb1 = Fiber(function () {
        v.compile('less', path, v.session);
        future.return();
      });
      fb1.run();

      var expected = {};
      expected[path] = 'compiling';

      assert.equals(compiler._queue, expected);

      v.compile('less', path, v.session);

      expected[path] = 'redo';

      assert.equals(compiler._queue, expected);
      assert.equals(compiler._queue, expected);

      refute.called(v.session.sendAll);

      future.wait();

      var output = fst.readFile(require.toUrl("./.build/compiler-test.less.css"));

      assert.match(output, /body\s*{\s*color: #cc0000;[\s\S]*sourceMap/);

      assert.calledOnce(v.session.sendAll);
      assert.calledWith(v.session.sendAll, 'SL', 'bart/css/.build/compiler-test.less');

      assert.equals(compiler._queue, {});
    },
  });
});

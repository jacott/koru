isServer && define(function (require, exports, module) {
  var test, v;
  var core = require('../core');
  var Future = require('fibers/future');
  var TH = require('../test');
  require('./less-watcher');
  var fw = require('../file-watch');
  var Path = require('path');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test queuing": function () {
      v.session = {sendAll: test.stub()};

      var watcher = fw.listeners.less;
      assert(watcher, "Should be registered with file-watch");

      var path =  Path.resolve(require.toUrl("./compiler-test.less"));
      var top = Path.resolve(require.toUrl("."))+'/';
      var future = new Future();
      var fb1 = core.Fiber(function () {
        watcher('less', "compiler-test.less", top, v.session);
        future.return();
      });
      fb1.run();

      assert.calledWith(v.session.sendAll, 'SL', 'koru/css/.build/compiler-test.less');
    },
  });
});

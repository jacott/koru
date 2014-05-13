define(function(require, exports, module) {
  var core = require('bart/core');

  require("./assertions-methods");
  require("./callbacks");
  require("./test-case");
  require("./runner");
  var geddon = require("./core");

  core.onunload(module, 'reload');

  var top = isServer ? global : window;

  top.assert = geddon.assert;
  top.refute = geddon.refute;

  var count, skipCount, errorCount, timer;

  var origLogger = core.logger;

  var self = {
    geddon: geddon,

    run: function (pattern, tests) {
      console.clear && console.clear();

      geddon.runArg = pattern;
      count = skipCount = errorCount = 0;

      core.logger = function (type) {
        origLogger.apply(core, arguments);
        var args = Array.prototype.slice.call(arguments, 1);
        self.logHandle(type+": "+(type === '\x44EBUG' ? geddon.inspect(args) : args.join(' ')));
      };

      require(tests, function () {
        geddon.start(isServer ? function (runNext) {
          core.Fiber(runNext).run();
        } : undefined);
      }, function(err) {
        ++errorCount;
        core.error(err.toString());
        endTest();
        tests.forEach(function (name) {
          core.unload(name);
        });
      });
    },

    testCase: function (module, option) {
      core.onunload(module, geddon.unloadTestcase);
      return geddon.testCase(module.id.replace(/-test$/, ''), option);
    },
  };

  geddon.onEnd(endTest);

  geddon.onTestStart(function (test) {
    timer = Date.now();
  });

  geddon.onTestEnd(function (test) {
    if (test.errors) {
      ++errorCount;

      var result= test.name + "\x00";
      var errors = test.errors;
      for(var i=0;i < errors.length; ++i) {
        result += errors[i]+"\n";
      }
      self.testHandle('E', result);
    }

    test.skipped ? ++skipCount : ++count;

    self.testHandle('R', test.name+ "\x00" + [count,geddon.testCount,errorCount,skipCount,Date.now() - timer].join(' '));
  });

  function endTest() {
    core.logger = origLogger;
    self.testHandle('F', errorCount);
    geddon._init();
  }

  return self;
});

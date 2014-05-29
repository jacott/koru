define(function(require, exports, module) {
  var env = require('../env');

  require("./assertions-methods");
  require("./callbacks");
  require("./test-case");
  require("./runner");
  var geddon = require("./core");

  env.onunload(module, 'reload');

  var top = isServer ? global : window;

  top.assert = geddon.assert;
  top.refute = geddon.refute;

  var count, skipCount, errorCount, timer;

  var origLogger = env.logger;

  var testRunCount = 0;

  var self = {
    geddon: geddon,

    match: geddon.sinon.match,

    run: function (pattern, tests) {
      if (isClient) document.title = 'Running: ' + document.title;
      console.log('*** test-start ' + ++testRunCount);

      geddon.runArg = pattern;
      count = skipCount = errorCount = 0;

      env.logger = function (type) {
        origLogger.apply(env, arguments);
        var args = Array.prototype.slice.call(arguments, 1);
        self.logHandle(type+": "+(type === '\x44EBUG' ? geddon.inspect(args, 5) : args.join(' ')));
      };

      require(tests, function () {
        geddon.start(isServer ? function (runNext) {
          env.Fiber(runNext).run();
        } : undefined);
      }, errorLoading);

      function errorLoading(err) {
        var badIds = env.discardIncompleteLoads();
        ++errorCount;
        if (err.originalError) err = err.originalError;
        if (('stack' in err))
          env.error(env.util.extractError(err));
        else
          env.error('Test load failure: ', err + "\nWhile loading:\n" + badIds.join("\n"));
        endTest();
      }
    },

    testCase: function (module, option) {
      env.onunload(module, geddon.unloadTestcase);
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
    if (isClient) document.title = document.title.replace(/Running: /, '');
    env.logger = origLogger;
    self.testHandle('F', errorCount);
    geddon._init();
  }

  return self;
});

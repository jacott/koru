define(function(require, exports, module) {
  var koru = require('../main');
  var util = require('../util');

  require("./assertions-methods");
  require("./callbacks");
  require("./test-case");
  require("./runner");
  var geddon = require("./core");

  koru._geddon_ = geddon; // helpful for errors finding test name

  koru.onunload(module, 'reload');

  var top = isServer ? global : window;

  top.assert = geddon.assert;
  top.refute = geddon.refute;

  var count, skipCount, errorCount, timer;

  var origLogger = koru.logger;

  var testRunCount = 0;

  geddon.sinon.match.near = function (expected, delta) {
    delta = delta  || 1;
    var match = geddon.sinon.match(function near(actual) {
      return actual > expected-delta && actual < expected+delta;
    });
    match.message = "match.near(" + expected + ", delta=" + delta + ")";
    return match;
  };

  var self = {
    geddon: geddon,

    match: geddon.sinon.match,

    get test() {return geddon.test},

    run: function (pattern, tests) {
      if (isClient) {
        document.title = 'Running: ' + document.title;
        window.onbeforeunload = warnFullPageReload;
      }
      console.log('*** test-start ' + ++testRunCount);

      geddon.runArg = pattern;
      count = skipCount = errorCount = 0;

      koru.logger = function (type) {
        origLogger.apply(koru, arguments);
        var args = util.slice(arguments, 1);
        self.logHandle(type+": "+(type === '\x44EBUG' ? geddon.inspect(args, 7) : args.join(' ')));
      };

      require(tests, function () {
        geddon.start(isServer ? function (runNext) {
          koru.Fiber(runNext).run();
        } : undefined);
      }, errorLoading);

      function errorLoading(err) {
        var badIds = koru.discardIncompleteLoads();
        ++errorCount;
        var orig = err;
        if (err.originalError) err = err.originalError;
        if (('stack' in err))
          koru.error(koru.util.extractError(err));
        else {
          koru.error('Test load failure: ', orig + "\nWhile loading:\n" + badIds.join("\n"));
        }
        endTest();
      }
    },

    testCase: function (module, option) {
      koru.onunload(module, geddon.unloadTestcase);
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
    if (isClient) {
      document.title = document.title.replace(/Running: /, '');
      window.onbeforeunload === warnFullPageReload && window.setTimeout(function () {
        window.onbeforeunload = null;
      }, 1);
    }
    koru.logger = origLogger;
    self.testHandle('F', errorCount);
    geddon._init();
  }

  function warnFullPageReload() {
    self.logHandle("\n\n*** ERROR: Some tests did a Full Page Reload ***\n");
  }

  return self;
});

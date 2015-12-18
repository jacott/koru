define(function(require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var Module = module.constructor;

  require("./assertions-methods");
  require("./callbacks");
  require("./test-case");
  require("./runner");
  var geddon = require("./core");

  Error.stackTraceLimit = 50;

  koru._geddon_ = geddon; // helpful for errors finding test name

  koru.onunload(module, 'reload');

  var top = isServer ? global : window;

  top.assert = geddon.assert;
  top.refute = geddon.refute;

  var count, skipCount, errorCount, timer;

  var origLogger = koru.logger;

  var testRunCount = 0;

  util.extend(geddon.sinon.match, {
    near: function (expected, delta) {
      delta = delta  || 1;
      return geddon.sinon.match(function matchNear(actual) {
        return actual > expected-delta && actual < expected+delta;
      }, "match.near(" + expected + ", delta=" + delta + ")");
    },

    field: function (name, value) {
      return geddon.sinon.match(function matchField(actual) {
        return actual && geddon._u.deepEqual(actual[name], value);
      }, "match.field(" + name + ", " + value + ")");
    },
  });

  geddon.sinon.format = function () {
    var result = [];
    util.forEach(arguments, function (arg) {
      result.push(util.inspect(arg));
    });
    return result.join(', ');
  };

  var self = {
    geddon: geddon,

    match: geddon.sinon.match,

    get test() {return geddon.test},

    stubProperty: function (object, prop, newValue) {
      var oldValue = Object.getOwnPropertyDescriptor(object, prop);
      if (typeof newValue !== 'object') {
        newValue = {value: newValue};
      }
      Object.defineProperty(object, prop, newValue);
      geddon.test.onEnd(function () {
        if (oldValue)
          Object.defineProperty(object, prop, oldValue);
        else
          delete object[prop];
      });
    },

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
        ++errorCount;
        if (err.onload) {
          var msg = [err.toString()];
          var modules = err.module.ctx.modules;
          var fetchNotReady = function (mod) {
            for (var depId in mod.dependants) {
              var depMod = modules[depId];
              if (! depMod || depMod.state !== Module.READY) {
                msg.push("\tat "+ (depMod ? isClient ? depMod.uri.slice(1) : depMod.uri : depId+'.js') + ':1:1');
                depMod && fetchNotReady(depMod);
              }
            }
          };
          fetchNotReady(err.module);
          koru.error(msg.join('\n'));
        }
        koru.error(koru.util.extractError(err));
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
    isClient && (geddon._origAfTimeout = koru.afTimeout, koru.afTimeout = koru.nullFunc);
  });

  geddon.onTestEnd(function (test) {
    koru.afTimeout = geddon._origAfTimeout;
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

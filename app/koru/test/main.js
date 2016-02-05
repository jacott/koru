define(function(require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var Module = module.constructor;

  require("./assertions-methods");
  require("./callbacks");
  require("./test-case");
  require("./runner");
  var geddon = require("./core");

  var RGBA_RE = /\s+rgba?\s*\((?:\s*(\d+)\s*,\s*)(?:\s*(\d+)\s*,\s*)(?:\s*(\d+)\s*)(?:,\s*([.\d]+))?\)/g;

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

  module.ctx.onError = function (err, mod) {
    if (err.onload) {
      var ctx = mod.ctx;
      var stack = Object.keys(koru.fetchDependants(mod)).map(function (id) {
        if (id === mod.id) return '';
        return "   at " + (isClient ? document.baseURI + id + '.js:1:1' : ctx.uri(id, '.js')+":1:1");
      }).join('\n');
      exports.logHandle("ERROR", koru.util.extractError({
        toString: function () {
          return "failed to load module: " + mod.id + '\nwith dependancies:\n';
        },
        stack: stack,
      }));
      return;
    }
    if (err.name === 'SyntaxError') {
      exports.logHandle('ERROR', err.message.replace(/([\S]*)([\s\S]*)/m, 'SyntaxError:\n  at $1\n$2'));
      return;
    }

    var errEvent = err.event;

    if (errEvent && errEvent.filename) {
      exports.logHandle('ERROR', koru.util.extractError({
        toString: function () {
          var uer = errEvent && errEvent.error;
          return uer ? uer.toString() : err.toString();
        },
        stack: "\tat "+ errEvent.filename + ':' + errEvent.lineno + ':' + errEvent.colno,
      }));
      return;
    }

    exports.logHandle('ERROR', koru.util.extractError(err));
  };

  exports = {
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
        console.log.apply(console, arguments);
        var args = new Array(arguments.length - 1);
        for(var i = 0; i < args.length; ++i) args[i] = arguments[i+1];
        exports.logHandle(type, (type === '\x44EBUG' ? geddon.inspect(args, 7) : args.join(' ')));
      };

      require(tests, function () {
        geddon.start(isServer ? function (runNext) {
          koru.Fiber(runNext).run();
        } : undefined);
      }, errorLoading);

      function errorLoading(err) {
        ++errorCount;
        endTest();
      }
    },

    testCase: function (module, option) {
      koru.onunload(module, geddon.unloadTestcase);
      return geddon.testCase(module.id.replace(/-test$/, ''), option);
    },

    normHTMLStr: function (html) {
      return html.replace(/(<[^>]+)>/g, function (m, m1) {
        if (m[1] === '/') return m;
        var parts = m1.replace(RGBA_RE, function (m) {return m.replace(/ /g, '')}).split(' ');
        if (parts.length === 1) return m;
        var p1 = parts[0];
        parts = parts.slice(1).sort();
        return p1 + ' ' + parts.join(' ') + '>';
      });
    }
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
      exports.testHandle('E', result);
    }

    test.skipped ? ++skipCount : ++count;

    exports.testHandle('R', test.name+ "\x00" + [count,geddon.testCount,errorCount,skipCount,Date.now() - timer].join(' '));
  });

  function endTest() {
    if (geddon.testCount === 0) {
      errorCount = 1;
      exports.testHandle('R', "No Tests!\x00" + [0,0,0,0,Date.now() - timer].join(' '));
    }

    if (isClient) {
      document.title = document.title.replace(/Running: /, '');
      window.onbeforeunload === warnFullPageReload && window.setTimeout(function () {
        window.onbeforeunload = null;
      }, 1);
    }
    koru.logger = origLogger;

    exports.testHandle('F', errorCount);
    geddon._init();
  }

  function warnFullPageReload() {
    exports.logHandle("\n\n*** ERROR: Some tests did a Full Page Reload ***\n");
  }

  return exports;
});

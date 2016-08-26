define(function(require, exports, module) {
  const koru   = require('../main');
  const util   = require('../util');
  require('./assertions-methods');
  require('./callbacks');
  const geddon = require('./core');
  const match  = require('./match');
  require('./runner');
  require('./test-case');

  const Module = module.constructor;

  const topDoc = isClient && (window.top ? window.top.document : document);

  Error.stackTraceLimit = 50;

  koru._geddon_ = geddon; // helpful for errors finding test name

  koru.onunload(module, 'reload');

  const top = isServer ? global : window;

  top.assert = geddon.assert;
  top.refute = geddon.refute;

  let count, skipCount, errorCount, timer;

  let testRunCount = 0;

  class MockModule {
    constructor(id, exports={}) {
      this.id = id;
      this.exports = exports;
    }

    $inspect() {return `{Module: ${this.id}}`;}
  }

  module.ctx.onError = function (err, mod) {
    if (err.onload) {
      var ctx = mod.ctx;
      var stack = Object.keys(koru.fetchDependants(mod)).map(function (id) {
        if (id === mod.id) return '';
        return "   at " + (isClient ? document.baseURI + id + '.js:1:1' : ctx.uri(id, '.js')+":1:1");
      }).join('\n');
      exports.logHandle("ERROR", koru.util.extractError({
        toString() {
          return "failed to load module: " + mod.id + '\nwith dependancies:\n';
        },
        stack: stack,
      }));
      return;
    }
    if (err.name === 'SyntaxError') {
      var m = /^([\S]*)([\s\S]*)    at.*vm.js:/m.exec(err.stack);
      exports.logHandle('ERROR', `\n    at ${m[1]}\n${m[2]}`);
      return;
    }

    var errEvent = err.event;

    if (errEvent && errEvent.filename) {
      exports.logHandle('ERROR', koru.util.extractError({
        toString() {
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
    geddon,

    match,

    MockModule,

    get test() {return geddon.test},

    logHandle(type, msg) {
      console.error(type, msg);
    },

    stubProperty(object, prop, newValue) {
      if (typeof newValue !== 'object')
        newValue = {value: newValue};
      var oldValue = koru.replaceProperty(object, prop, newValue);
      geddon.test.onEnd(restore);

      function restore() {
        if (oldValue)
          Object.defineProperty(object, prop, oldValue);
        else
          delete object[prop];
      }

      return restore;
    },

    run(pattern, tests) {
      if (geddon.reload) {
        exports.testHandle('E', 'Reloading...\x00');
        exports.testHandle('F', 1);
        return koru.reload();
      }
      if (isClient) {
        topDoc.title = 'Running: ' + topDoc.title;
        window.onbeforeunload = warnFullPageReload;
      }
      console.log('*** test-start ' + ++testRunCount);

      geddon.runArg = pattern;
      count = skipCount = errorCount = 0;

      require(tests, function (...args) {
        koru.Fiber(() => {geddon.start(args)}).run();
      }, errorLoading);

      function errorLoading(err) {
        ++errorCount;
        endRun();
      }
    },

    testCase(module, option) {
      var tc = geddon.testCase(module.id.replace(/-test$/, ''), option);
      module.exports = tc;
      return tc;
    },

    normHTMLStr(html) {
      return html.replace(/(<[^>]+)>/g, function (m, m1) {
        if (m[1] === '/') return m;
        var parts = m1.replace(/="[^"]*"/g, function (m) {
          return m.replace(/ /g, '\xa0');
        }).split(' ');
        if (parts.length === 1) return m;
        var p1 = parts[0];
        parts = parts.slice(1).sort();
        return p1 + ' ' + parts.join(' ').replace(/\xa0/g, ' ') + '>';
      });
    }
  };

  koru.logger = function (type, ...args) {
    console.log.apply(console, args);
    exports.logHandle(type, (type === '\x44EBUG' ? geddon.inspect(args, 7) : args.join(' ')));
  };

  geddon.onEnd(endRun);

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

  function endRun() {
    if (geddon.testCount === 0) {
      errorCount = 1;
      exports.testHandle('R', "No Tests!\x00" + [0,0,0,0,Date.now() - timer].join(' '));
    }

    if (isClient) {
      topDoc.title = topDoc.title.replace(/Running:\s*/, '');
      window.onbeforeunload === warnFullPageReload && window.setTimeout(function () {
        window.onbeforeunload = null;
      }, 1);
    }

    exports.testHandle('F', errorCount);
    geddon._init();
  }

  function warnFullPageReload() {
    exports.logHandle("\n\n*** ERROR: Some tests did a Full Page Reload ***\n");
  }

  module.exports = exports;
});

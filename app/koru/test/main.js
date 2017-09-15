define(function(require, exports, module) {
  const stubber = require('koru/test/stubber');
  const koru    = require('../main');
  const util    = require('../util');
  require('./assertions-methods');
  require('./callbacks');
  const geddon  = require('./core');
  const match   = require('./match');
  require('./runner');
  require('./test-case');

  const Module = module.constructor;
  const restorSpy = spy => ()=>{spy.restore && spy.restore()};

  const topDoc = isClient && (window.top ? window.top.document : document);

  const onEnd = func=>geddon.test.onEnd(func);
  const stub = (...args)=>geddon.test.stub(...args);
  const spy = (...args)=>geddon.test.spy(...args);

  const intercept = (...args)=>{
    const spy = stubber.intercept(...args);
    geddon.test.onEnd(restorSpy(spy));
    return spy;
  };

  const stubProperty = (object, prop, newValue)=>{
    if (typeof newValue !== 'object')
      newValue = {value: newValue};
    const oldValue = koru.replaceProperty(object, prop, newValue);
    geddon.test.onEnd(restore);

    function restore() {
      if (oldValue)
        Object.defineProperty(object, prop, oldValue);
      else
        delete object[prop];
    }

    return restore;
};

  Error.stackTraceLimit = 100;

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

    onUnload() {}

    $inspect() {return `{Module: ${this.id}}`;}
  }

  module.ctx.onError = (err, mod)=>{
    if (err.onload) {
      const {ctx} = mod;
      const stack = Object.keys(koru.fetchDependants(mod)).map(id =>{
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
      const m = /^([\S]*)([\s\S]*)    at.*vm.js:/m.exec(err.stack);
      exports.logHandle('ERROR', m ? `\n    at ${m[1]}\n${m[2]}` : util.extractError(err));
      return;
    }

    const errEvent = err.event;

    if (errEvent && errEvent.filename) {
      exports.logHandle('ERROR', koru.util.extractError({
        toString() {
          const uer = errEvent && errEvent.error;
          return uer ? uer.toString() : err.toString();
        },
        stack: "\tat "+ errEvent.filename + ':' + errEvent.lineno + ':' + errEvent.colno,
      }));
      return;
    }

    exports.logHandle('ERROR', koru.util.extractError(err));
  };

  const warnFullPageReload = ()=>{
    exports.logHandle("\n\n*** ERROR: Some tests did a Full Page Reload ***\n");
  };

  exports = {
    get test() {return geddon.test},
    geddon,
    match,
    MockModule,
    stubProperty,
    onEnd,
    spy,
    stub,
    intercept,

    logHandle(type, msg) {
      console.error(type, msg);
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

      require(tests, (...args)=>{
        koru.runFiber(() => {geddon.start(args)});
      }, err => {
        ++errorCount;
        if (err.module) {
          koru.error(`Error loading dependancies:
${Object.keys(koru.fetchDependants(err.module)).join(' <- ')}`);
        }
        endRun();
      });
    },

    testCase(module, option) {
      return module.exports = geddon.testCase(module.id.replace(/-test$/, ''), option);
    },

    normHTMLStr(html) {
      return html.replace(/(<[^>]+)>/g, (m, m1)=>{
        if (m[1] === '/') return m;
        let parts = m1.replace(/="[^"]*"/g, m => m.replace(/ /g, '\xa0')).split(' ');
        if (parts.length === 1) return m;
        const p1 = parts[0];
        parts = parts.slice(1).sort();
        return `${p1} ${parts.join(' ').replace(/\xa0/g, ' ')}>`;
      });
    }
  };

  koru.logger = (type, ...args)=>{
    console.log.apply(console, args);
    exports.logHandle(type, (type === '\x44EBUG' ? geddon.inspect(args, 7) : args.join(' ')));
  };

  geddon.onEnd(endRun);

  geddon.onTestStart(test=>{
    timer = Date.now();
    isClient && (geddon._origAfTimeout = koru.afTimeout, koru.afTimeout = koru.nullFunc);
  });

  geddon.onTestEnd(test=>{
    koru.afTimeout = geddon._origAfTimeout;
    if (test.errors) {
      ++errorCount;

      let result = `${test.name}\x00`;
      const {errors} = test;
      for(let i = 0; i < errors.length; ++i) {
        result += errors[i]+"\n";
      }
      exports.testHandle('E', result);
    }

    test.skipped ? ++skipCount : ++count;

    exports.testHandle('R', `${test.name}\x00` + [
      count,geddon.testCount,errorCount,skipCount,Date.now() - timer].join(' '));
  });

  function endRun() {
    if (geddon.testCount === 0) {
      errorCount = 1;
      exports.testHandle('R', "No Tests!\x00" + [0,0,0,0,Date.now() - timer].join(' '));
    }

    if (isClient) {
      topDoc.title = topDoc.title.replace(/Running:\s*/, '');
      window.onbeforeunload === warnFullPageReload && window.setTimeout(()=>{
        window.onbeforeunload = null;
      }, 1);
    }

    exports.testHandle('F', errorCount);
    geddon._init();
  }

  module.exports = exports;
});

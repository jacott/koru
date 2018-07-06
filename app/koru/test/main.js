define((require, exports, module)=>{
  const koru            = require('koru');
  const {inspect$}      = require('koru/symbols');
  const stubber         = require('koru/test/stubber');
  const util            = require('koru/util');
  require('./assertions-methods');
  require('./callbacks');
  const Core            = require('./core');
  require('./test-case');

  const Module = module.constructor;

  const restorSpy = spy => ()=>{spy.restore && spy.restore()};
  const onEnd = callback => Core.test.onEnd(callback);
  const stub = (...args)=>Core.test.stub(...args);
  const spy = (...args)=>Core.test.spy(...args);

  const intercept = (...args)=>{
    const spy = stubber.intercept(...args);
    Core.test.onEnd(restorSpy(spy));
    return spy;
  };

  const stubProperty = (object, prop, newValue)=>{
    if (typeof newValue !== 'object')
      newValue = {value: newValue};
    const oldValue = koru.replaceProperty(object, prop, newValue);

    const restore = ()=>{
      if (oldValue)
        Object.defineProperty(object, prop, oldValue);
      else
        delete object[prop];
    };

    Core.test.onEnd(restore);

    return restore;
  };

  const topDoc = isClient && (window.top ? window.top.document : document);

  const {match} = Core;

  match.near = (expected, delta)=>{
    delta = delta  || 1;
    return match(
      actual => actual > expected-delta && actual < expected+delta,
      "match.near(" + expected + ", delta=" + delta + ")");
  };

  match.field= (name, value)=> match(
    actual => actual && Core.deepEqual(actual[name], value),
    "match.field(" + name + ", " + value + ")");

  Error.stackTraceLimit = 100;

  koru._TEST_ = Core; // helpful for errors finding test name

  koru.onunload(module, 'reload');

  const top = isServer ? global : window;

  top.assert = Core.assert;
  top.refute = Core.refute;

  let count, skipCount, errorCount, timer;

  let testRunCount = 0;

  class MockModule {
    constructor(id, exports={}) {
      this.id = id;
      this.exports = exports;
    }

    onUnload() {}

    [inspect$]() {return `{Module: ${this.id}}`;}
  }

  module.ctx.onError = (err, mod)=>{
    if (err.onload) {
      const {ctx} = mod;
      const stack = Object.keys(koru.fetchDependants(mod)).map(id =>{
        if (id === mod.id) return '';
        return "   at " + (isClient ? document.baseURI + id + '.js:1:1' : ctx.uri(id, '.js')+":1:1");
      }).join('\n');
      Main.logHandle("ERROR", koru.util.extractError({
        toString() {
          return "failed to load module: " + mod.id + '\nwith dependancies:\n';
        },
        stack: stack,
      }));
      return;
    }
    if (err.name === 'SyntaxError') {
      const m = /^([\S]*)([\s\S]*)    at.*vm.js:/m.exec(err.stack);
      Main.logHandle('ERROR', m ? `\n    at ${m[1]}\n${m[2]}` : util.extractError(err));
      return;
    }

    const errEvent = err.event;

    if (errEvent && errEvent.filename) {
      Main.logHandle('ERROR', koru.util.extractError({
        toString() {
          const uer = errEvent && errEvent.error;
          return uer ? uer.toString() : err.toString();
        },
        stack: "\tat "+ errEvent.filename + ':' + errEvent.lineno + ':' + errEvent.colno,
      }));
      return;
    }

    Main.logHandle('ERROR', koru.util.extractError(err));
  };

  const warnFullPageReload = ()=>{
    Main.logHandle("\n\n*** ERROR: Some tests did a Full Page Reload ***\n");
  };

  const endRun = ()=>{
    if (Core.testCount === 0) {
      errorCount = 1;
      Main.testHandle('R', "No Tests!\x00" + [0,0,0,0,Date.now() - timer].join(' '));
    }

    if (isClient) {
      topDoc.title = topDoc.title.replace(/Running:\s*/, '');
      window.onbeforeunload === warnFullPageReload && window.setTimeout(()=>{
        window.onbeforeunload = null;
      }, 1);
    }

    Main.testHandle('F', errorCount);
    Core._init();
  };

  const Main = {
    get test() {return Core.test},
    Core,
    util,
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
      if (Core.reload) {
        Main.testHandle('E', 'Reloading...\x00');
        Main.testHandle('F', 1);
        return koru.reload();
      }
      if (isClient) {
        topDoc.title = 'Running: ' + topDoc.title;
        window.onbeforeunload = warnFullPageReload;
      }
      console.log('*** test-start ' + ++testRunCount);

      Core.runArg = pattern || undefined;
      count = skipCount = errorCount = 0;

      require(tests, (...args)=>{
        koru.runFiber(() => {Core.start(args)});
      }, err => {
        ++errorCount;
        if (err.module) {
          koru.error(`Error loading dependancies:
${Object.keys(koru.fetchDependants(err.module)).join(' <- ')}`);
        }
        endRun();
      });
    },

    testCase(module, body) {
      return module.exports = Core.testCase(module.id.replace(/-test$/, ''), body);
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
    Main.logHandle(type, (type === '\x44EBUG' ? util.inspect(args, 7) : args.join(' ')));
  };

  Core.onEnd(endRun);

  Core.onTestStart(test=>{
    timer = Date.now();
    isClient && (Core._origAfTimeout = koru.afTimeout, koru.afTimeout = koru.nullFunc);
  });

  Core.onTestEnd(test=>{
    koru.afTimeout = Core._origAfTimeout;
    if (test.errors) {
      ++errorCount;

      let result = `${test.name}\x00`;
      const {errors} = test;
      for(let i = 0; i < errors.length; ++i) {
        result += errors[i]+"\n";
      }
      Main.testHandle('E', result);
    }

    test.skipped ? ++skipCount : ++count;

    Main.testHandle('R', `${test.name}\x00` + [
      count,Core.testCount,errorCount,skipCount,Date.now() - timer].join(' '));
  });

  return Main;
});

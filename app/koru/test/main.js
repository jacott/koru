define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const {inspect$}      = require('koru/symbols');
  const stubber         = require('koru/test/stubber');
  const util            = require('koru/util');
  require('./assertions-methods');
  const Core            = require('./core');

  require('./test-case');

  const Module = module.constructor;

  const NUMBER_RE = /([\d.]+(?:e[+-]\d+)?)/;

  const origAfTimeout = Core._origAfTimeout = koru.afTimeout;

  const restorSpy = (spy) => () => {spy.restore && spy.restore()};
  const after = (callback) => Core.test.after(callback);
  const stub = (...args) => Core.test.stub(...args);
  const spy = (...args) => Core.test.spy(...args);

  const intercept = (...args) => {
    const spy = stubber.intercept(...args);
    Core.test.after(restorSpy(spy));
    return spy;
  };

  const stubProperty = (object, prop, newValue) => {
    if (typeof newValue !== 'object') {
      newValue = {value: newValue};
    }
    const oldValue = util.setProperty(object, prop, newValue);

    const restore = () => {
      if (oldValue !== void 0) {
        Object.defineProperty(object, prop, oldValue);
      } else {
        delete object[prop];
      }
    };

    Core.test.after(restore);

    return restore;
  };

  const topDoc = isClient && (window.top ? window.top.document : document);

  const {match} = Core;

  const withinDelta = (
    actual, expected, delta,
  ) => actual > expected - delta && actual < expected + delta;

  match.near = (expected, delta=1) => match(
    (actual) => {
      switch (typeof expected) {
      case 'string':
        if (typeof actual === 'number') actual = '' + actual;
        if (typeof actual !== 'string') {
          return false;
        }
        const expParts = expected.split(NUMBER_RE);
        const actParts = actual.split(NUMBER_RE);
        for (let i = 0; i < expParts.length; ++i) {
          const e = expParts[i], a = actParts[i];
          if (i % 2) {
            const f = e.split('.')[1] || '';
            const delta = 1 / Math.pow(10, f.length);

            if (! withinDelta(+a, +e, delta)) {
              return false;
            }
          } else if (e !== a) {
            return false;
          }
        }
        return true;
      case 'object':
        for (let key in expected) {
          if (! withinDelta(actual[key], expected[key], delta)) {
            return false;
          }
        }
        return true;
      default:
        return withinDelta(actual, expected, delta);
      }}, 'match.near(' + expected + ', delta=' + delta + ')');

  match.field = (name, value) => match(
    (actual) => actual && Core.deepEqual(actual[name], value),
    'match.field(' + name + ', ' + value + ')');

  Error.stackTraceLimit = 100;

  koru._TEST_ = Core; // helpful for errors finding test name

  koru.onunload(module, 'reload');

  globalThis.assert = Core.assert;
  globalThis.refute = Core.refute;

  let count, errorCount, timer, lastTest;

  let testRunCount = 0;

  class MockModule {
    constructor(id, exports={}) {
      this.id = id;
      this.exports = exports;
    }

    onUnload() {}

    [inspect$]() {return `Module("${this.id}")`}
  }

  const warnFullPageReload = () => {
    Main.logHandle('\n\n*** ERROR: Some tests did a Full Page Reload ***\n');
  };

  const recordTCTime = () => {
    if (lastTest !== undefined) {
      const {topTC} = lastTest;
      topTC.duration += timer;
    }
  };

  const endRun = () => {
    recordTCTime();
    if (koru.afTimeout !== origAfTimeout) {
      koru.afTimeout = origAfTimeout;
    }
    timer = lastTest = undefined;
    if (Core.testCount === 0) {
      errorCount = 1;
      Main.testHandle('R', "No Tests!\u0000" + [0, 0, 0, 0, Date.now() - timer].join(' '));
    }

    if (isClient) {
      topDoc.title = topDoc.title.replace(/Running:\s*/, '');
      window.onbeforeunload === warnFullPageReload && window.setTimeout(() => {
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
    after,
    onEnd: after,
    spy,
    stub,
    intercept,

    logHandle(type, msg) {
      console.error(type, msg);
    },

    run(pattern, tests) {
      if (Core.abortMode === 'reload') {
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
      count = errorCount = 0;

      require(tests, (...args) => {
        koru.runFiber(() => Core.start(Core.testCases = args));
      }, (err) => {
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
      return html.replace(/(<[^>]+)>/g, (m, m1) => {
        if (m[1] === '/') return m;
        let parts = m1.replace(/="[^"]*"/g, (m) => m.replace(/ /g, '\xa0')).split(' ');
        if (parts.length === 1) return m;
        const p1 = parts[0];
        parts = parts.slice(1).sort();
        return `${p1} ${parts.join(' ').replace(/\xa0/g, ' ')}>`;
      });
    },
  };

  Core.abort = (ex) => {
    const {name, location: {name: fn, line}} = Core.test;
    Main.logHandle(
      'E', (typeof ex === 'string' ? ex : koru.util.extractError(ex)) +
        '\n\n**** Tests aborted! *****\n' +
        name +
        `\n     at - ${fn}.js:${line}`);
    Core.abortMode = 'reload';
    Main.testHandle('F', Core.testCount + 1);
    Core.runCallBacks('abort', Core.test);
  };

  Core.worstTCS = () => Core.testCases
    .sort((a, b) => b.duration - a.duration)
    .map((a) => a && a.name + ': ' + a.duration);

  koru.logger = (type, ...args) => {
    console.log(...args);
    Main.logHandle(type, (type === 'D' ? util.inspect(args, 7) : args.join(' ')));
  };

  Core.onEnd(endRun);

  Core.onTestStart((test) => {
    if (timer === undefined) {
      timer = Date.now();
      koru.afTimeout = origAfTimeout;
    }

    if (lastTest === undefined || test.topTC !== lastTest.topTC) {
      test.topTC.duration = -timer;
      recordTCTime();
    }
    lastTest = test;
    if (isClient) koru.afTimeout = () => util.voidFunc;
  });

  Core.onTestEnd((test) => {
    if (test.errors) {
      ++errorCount;

      let result = `${test.name}\x00`;
      const {errors} = test;
      for (let i = 0; i < errors.length; ++i) {
        result += errors[i] + '\n';
      }
      Main.testHandle('E', result);
    }

    ++count;
    const now = Date.now();

    Main.testHandle('R', `${test.name}\x00` + [
      count, Core.testCount, errorCount, Core.skipCount, now - timer].join(' '));

    timer = now;
  });

  return Main;
});

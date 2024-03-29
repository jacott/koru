define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const LinkedList      = require('koru/linked-list');
  const Core            = require('koru/test/core');
  const stubber         = require('koru/test/stubber');
  const util            = require('koru/util');

  const timeout$ = Symbol(), isDone$ = Symbol(), after$ = Symbol();
  const once$ = Symbol(), temp$ = Symbol(), before$ = Symbol();

  const MAX_TIME = 2000;

  let isOnce = false;
  let currentTC, tests;
  let lastTest, currTest, nextTest, common, nextFunc;
  let nt = 0, assertCount = 0;
  let asyncTimeout = 0;

  const {clearTimeout, setTimeout} = globalThis; // isolate from stubbing

  const assertIsPromise = (p, f) => {(p == null || typeof p.then !== 'function') && notPromise(f)};

  const notPromise = (f) => {
    assert.fail(`Expected return of undefined or a Promise ${Core.test.mode}:
${Core.test.name}` + (f ? ` Return is in code:\n ${f.toString()}` : ''));
  };

  const checkAssertionCount = (test, assertCount) => {
    if (assertCount !== Core.assertCount) {
      test.success = true;
    } else {
      test.success = false;

      const {name, line} = test.location;

      test.errors = [
        'Failure: No assertions\n    at - ' +
          `test.body (${name}.js:${line}:1)`,
      ];
    }
  };

  const runListAndAsyncCallbacks = async (value, i, list, node) => {
    const {test} = Core;
    for (;i >= 0; --i) {
      const func = value[i];
      if (typeof func === 'function') {
        await func.call(test);
      } else {
        func.stop();
      }
    }
    await runAsyncCallbacks(list, node);
  };

  const runAsyncCallbacks = async (list, node) => {
    const {test} = Core;
    let prev = node;

    for (node = node.next; node !== undefined; node = node.next) {
      if (node[temp$] === true) {
        list.removeNode(node, prev);
      } else {
        prev = node;
      }
      const {value} = node;
      if (typeof value === 'function') {
        await value.call(test);
      } else if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; --i) {
          const func = value[i];
          if (typeof func === 'function') {
            await func.call(test);
          } else {
            func.stop();
          }
        }
      } else {
        value.stop();
      }
    }
  };

  const runCallbacks = (list) => {
    if (list === undefined) return;
    const {test} = Core;
    let prev;
    for (let node = list.front; node !== undefined; node = node.next) {
      if (node[temp$] === true) {
        list.removeNode(node, prev);
      } else {
        prev = node;
      }
      const {value} = node;
      if (typeof value.stop === 'function') {
        value.stop();
      } else if (typeof value === 'function') {
        const promise = value.call(test);
        if (promise !== undefined) {
          assertIsPromise(promise, value);
          return node.next === undefined
            ? promise
            : promise.then(() => runAsyncCallbacks(list, node));
        }
      } else if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; --i) {
          const func = value[i];
          if (typeof func.stop === 'function') {
            func.stop();
          } else {
            const promise = func.call(test);
            if (promise !== undefined) {
              assertIsPromise(promise, func);
              return i > 0
                ? promise.then(() => {runListAndAsyncCallbacks(value, i - 1, list, node)})
                : promise;
            }
          }
        }
      }
    }
  };

  const runOnceCallbacks = (list) => {
    try {
      isOnce = true;
      return runCallbacks(list);
    } finally {
      isOnce = false;
    }
  };

  const runTearDowns = (tc, common) => {
    currentTC = tc;
    if (tc === undefined) return;

    const sameTC = tc === common;
    const once = tc[once$];

    const promise = runCallbacks(tc[after$]);

    if (promise !== undefined) {
      return promise.then(async () => {
        if (sameTC) {
          if (once !== undefined) return;
        }
        if (once !== undefined) {
          await runOnceCallbacks(once.after);
        }
        const pTc = tc.tc;
        if (pTc === undefined) {
          common === undefined && reset(tc);
        } else {
          await runTearDowns(pTc, sameTC ? pTc : common);
        }
      });
    }

    if (sameTC) {
      if (once !== undefined) return;
    } else if (once !== undefined) {
      const promise = runOnceCallbacks(once.after);
      if (promise !== undefined) {
        return promise.then(() => {
          const pTc = tc.tc;
          if (pTc === undefined) {
            common === undefined && reset(tc);
          } else {
            return runTearDowns(pTc, sameTC ? pTc : common);
          }
        });
      }
    }
    const pTc = tc.tc;
    if (pTc === undefined) {
      common === undefined && reset(tc);
    } else {
      return runTearDowns(pTc, sameTC ? pTc : common);
    }
  };

  const runSetups = (tc, common) => {
    currentTC = tc;
    if (tc === undefined) return;

    const sameTC = tc === common;
    const once = tc[once$];

    if (! sameTC || once === undefined) {
      const pTc = tc.tc;
      const promise = runSetups(pTc, sameTC ? pTc : common);
      if (promise !== undefined) {
        return promise.then(async () => {
          currentTC = tc;
          if (once !== undefined) {
            await runOnceCallbacks(once.before);
          }
          await runCallbacks(tc[before$]);
        });
      }
      currentTC = tc;
      if (once !== undefined) {
        const promise = runOnceCallbacks(once.before);
        if (promise !== undefined) {
          return promise.then(() => runCallbacks(tc[before$]));
        }
      }
    }
    return runCallbacks(tc[before$]);
  };

  const commonTC = (ot, nt) => {
    if (ot === undefined || nt === undefined) {
      return;
    }

    let otc = ot.tc, ntc = nt.tc;

    if (otc === undefined || ntc === undefined) {
      return;
    }

    while (ntc.level > otc.level) ntc = ntc.tc;
    while (otc.level > ntc.level) otc = otc.tc;

    while (ntc !== otc) {
      ntc = ntc.tc; otc = otc.tc;
    }

    return ntc;
  };

  const once = (tc) => tc[once$] ??= {before: new LinkedList(), after: new LinkedList()};
  const before = (tc, func) => (tc[before$] ??= new LinkedList()).addBack(func);
  const after = (tc, func) => (tc[after$] ??= new LinkedList()).addFront(func);

  const reset = (tc) => {
    tc[before$] = tc[after$] = tc[once$] = undefined;
  };

  class TestCase {
    constructor(name, tc, body) {
      this.name = name;
      this.tc = tc;
      this.level = tc === undefined ? 0 : tc.level + 1;
      this.body = body;
    }

    fullName(name) {
      const ret = this.tc ? this.tc.fullName(this.name) : this.name;
      return name ? ret + ' ' + name : ret;
    }

    topTestCase() {
      let top = this;
      while (top.tc != null) top = top.tc;
      return top;
    }

    before(func) {
      once(this).before.addBack(func);
    }
    after(func) {
      once(this).after.addFront(func);
    }

    beforeEach(func) {before(this, func)}
    afterEach(func) {after(this, func)}

    addTest(name, body, skipped=false) {
      if (typeof name === 'string' && name[0] === '/' && name[1] === '/') {
        skipped = true;
        name = name.slice(2);
      }

      name = 'test ' + name + '.';
      Object.defineProperty(body, 'name', {value: name});

      const fn = this.fullName(name);

      if (Core.runArg === undefined || fn.indexOf(Core.runArg) !== -1) {
        ++Core.testCount;
        if (skipped) {
          ++Core.skipCount;
        } else {
          tests.push(new Test(fn, this, body));
        }
      }
    }

    get moduleId() {
      return this.tc ? this.tc.moduleId : this.name + '-test';
    }
  }

  const restorSpy = (spy) => () => {spy.restore?.()};

  Core.testCase = (name, body) => new TestCase(name, undefined, body);

  Object.defineProperty(Core, 'currentTestCase', {get: () => currentTC});

  class Test {
    constructor(name, tc, body) {
      this.name = name;
      this.tc = tc;
      this.topTC = tc.topTestCase();
      this.body = body;
      this.mode = 'init';
    }

    after(func) {
      const tc = currentTC ?? this.tc;
      (isOnce
        ? once(tc).after.addFront(func)
        : after(tc, func))[temp$] = true;
    }

    spy(...args) {
      const spy = stubber.spy.apply(stubber, args);
      this.after(restorSpy(spy));
      return spy;
    }

    stub(...args) {
      const spy = stubber.stub.apply(stubber, args);
      this.after(restorSpy(spy));
      return spy;
    }

    intercept(...args) {
      const spy = stubber.intercept.apply(stubber, args);
      this.after(restorSpy(spy));
      return spy;
    }

    get func() {return this.body}

    get location() {
      let line = 1;
      const name = this.moduleId;
      const mod = module.get(name);
      if (mod != null) {
        const tcbody = mod.body.toString();
        const testName = this.name.replace(/^.*?\btest /, '').slice(0, -1);
        const testbody = `test("${testName}", ${this.body.toString()}`;

        let idx = tcbody.indexOf(testbody);

        if (idx !== -1) {
          for (let ni = tcbody.indexOf('\n'); ni !== -1 && ni < idx; ni = tcbody.indexOf('\n', ni + 1)) {
            ++line;
          }
        }
      }

      return {name, line};
    }

    get moduleId() {return this.topTC.moduleId}
  }

  Test.prototype.onEnd = Test.prototype.after;

  let skipped = false;

  const expandTestCase = (tc, skipped=false) => {
    const origTC = currentTC;
    currentTC = tc;

    builder.exec(tc.body);

    currentTC = origTC;
  };

  const builder = {
    // aroundEach: body => currentTC.add('setUpAround', body),
    beforeEach: (body) => currentTC.beforeEach(body),
    afterEach: (body) => currentTC.afterEach(body),
    before: (body) => currentTC.before(body),
    after: (body) => {
      const {test} = Core;
      if (test === undefined) {
        currentTC.after(body);
      } else {
        test.after(body);
      }
    },

    test: (name, body) => currentTC.addTest(name, body, skipped),

    group: (name, body) => {
      const otc = currentTC;
      const os = skipped;
      if (name[0] === '/' && name[1] === '/') {
        skipped = true;
        name = name.slice(2);
      }
      const ntc = new TestCase(name, otc);
      try {
        currentTC = ntc;
        ntc.body = body;
        body(ntc);
        return ntc;
      } finally {
        skipped = os;
        currentTC = otc;
      }
    },

    exec: (body) => {
      if (typeof body === 'function') {
        body(builder);
      } else {
        for (const name in body) {
          const value = body[name];
          if (typeof value === 'function') {
            switch (name) {
            case 'setUp': case 'beforeEach':
              currentTC.beforeEach(value);
              break;
            case 'tearDown': case 'afterEach':
              currentTC.afterEach(value);
              break;
            case 'setUpOnce': case 'before':
              currentTC.before(value);
              break;
            case 'tearDownOnce': case 'after':
              currentTC.after(value);
              break;
            default:
              if (! name.startsWith('test ')) {
                assert.fail('misnamed test ' + currentTC.fullName(name), 1);
              }
              builder.test(name.slice(5), value);
            }
          } else {
            expandTestCase(new TestCase(name, currentTC, value));
          }
        }
      }
    },
  };

  builder.it = builder.test;
  builder.describe = builder.group;

  const testStart = () => {
    currTest.mode = 'before';
    const promise = Core.runCallBacks('testStart', currTest);
    nextFunc = setup;
    return promise === undefined ? setup() : promise;
  };

  const setup = () => {
    const promise = runSetups(currTest.tc, common);
    nextFunc = runTest;
    return promise === undefined ? runTest() : promise;
  };

  const runDone = () => {
    let isDone = false, resolve, reject;
    const done = (err) => {
      isDone = true;
      if (resolve !== undefined) {
        err === undefined ? resolve() : reject(err);
      } else if (err !== undefined) {
        throw err;
      }
    };
    currTest.body(done);
    if (isDone) return;
    return new Promise((res, rej) => {resolve = res; reject = rej});
  };

  const runTest = () => {
    nextFunc = tearDown;
    currTest.mode = 'running';
    assertCount = Core.assertCount;
    const promise = currTest.body.length === 1
      ? runDone()
      : currTest.body();
    return promise == undefined ? tearDown() : promise;
  };

  const tearDown = () => {
    common = commonTC(currTest, nextTest);
    nextFunc = testEnd;
    currTest.errors === undefined && checkAssertionCount(currTest, assertCount);
    currTest.mode = 'after';
    const promise = runTearDowns(currTest.tc, common);
    return promise === undefined ? testEnd() : promise;
  };

  const testEnd = () => {
    nextFunc = testStart;
    return Core.runCallBacks('testEnd', currTest);
  };

  const handleAsyncError = (err) => {
    asyncTimeout == 0 || clearTimeout(asyncTimeout);
    if (handleError(err)) {
      runNext();
    }
  };

  const handleError = (err) => {
    const {test} = Core;
    if (test === undefined) return false;
    test.success = false;
    if (err === 'abortTests') {
      Core.abort(err);
      return false;
    }
    if (err?.name === 'intercept') {
      Core.assertCount = -1;
      return true;
    }
    const isAssertionError = err instanceof Core.AssertionError;
    if (! isAssertionError) {
      (test.errors ??= []).push(
        (err instanceof Error)
          ? util.extractError(err)
          : (err === 'timeout'
            ? 'Test timed out'
            : (err === 'wrongReturn'
              ? 'Unexpected return value'
              : util.extractError(new Error(typeof (err) === 'string' ? err : util.inspect(err))))));
    }
    if (Core.test.mode !== 'running') {
      Core.sendErrors(test);
      Core.abort(`\n**** Failure during ${Core.test.mode} ****`);
      return false;
    }
    return true;
  };

  const timeExpired = () => {
    asyncTimeout = 0;
    handleError('timeout');
    runNext();
  };

  const runAsyncNext = () => {
    if (asyncTimeout != 0) {
      clearTimeout(asyncTimeout);
      asyncTimeout = 0;
    }

    runNext();
  };

  const runNext = () => {
    while (true) {
      if (Core.abortMode !== undefined) {
        if (Core.abortMode === 'end') {
          nextFunc = (Core.test !== undefined && Core.test.mode !== 'after') ? tearDown : testStart;
          nextTest = undefined;
          nt = tests.length;
        } else {
          return;
        }
      }
      if (nextFunc === testStart) {
        if (nt == tests.length) {
          Core.lastTest = Core.test = tests = undefined;
          Core.runCallBacks('end');
          return;
        }
        Core.lastTest = lastTest = currTest;
        currTest = Core.test = tests[nt];
        tests[nt++] = null;
        nextTest = nt < tests.length ? tests[nt] : undefined;
      }
      try {
        const promise = nextFunc();
        if (promise !== undefined) {
          assertIsPromise(promise);
          asyncTimeout = setTimeout(timeExpired, MAX_TIME);
          promise.then(runAsyncNext, handleAsyncError);
          return;
        }
      } catch (err) {
        handleError(err);
      }
    }
  };

  Core.start = (testCases, runNextWrapper) => {
    tests = [];
    nt = assertCount = 0;
    Core.test = Core.lastTest = undefined;
    lastTest = currTest = nextTest = common = nextFunc = undefined;
    nextFunc = testStart;

    if (util[isTest] !== undefined) {
      while (util[isTest].length != 0) {
        util[isTest].pop()(Core);
      }
    }

    for (let i = 0; i < testCases.length; ++i) {
      const tc = testCases[i];
      if (tc === undefined) continue;

      skipped = false;

      expandTestCase(tc);
      testCases[i] = null;
    }

    return ifPromise(Core.runCallBacks('start'), runNext);
  };

  return TestCase;
});

define(function(require, exports, module) {
  const koru            = require('koru');
  const TestCase        = require('koru/test/test-case');
  const Core            = require('./core');

  const asyncNext = func => {koru.runFiber(func)};

  let currentTc;

  const builder = {
    beforeEach: func => currentTc.add('setUp', func),
    afterEach: func => currentTc.add('tearDown', func),
    before: func => currentTc.add('setUpOnce', func),
    after: func => currentTc.add('tearDownOnce', func),

    test: (name, func)=> currentTc.add("test "+name, func),

    group: (name, func)=>{
      const otc = currentTc;
      const ntc = new TestCase(name, otc);
      try {
        currentTc = ntc;
        func(ntc);
      } finally {
        currentTc = otc;
        return ntc;
      }
    }
  };

  builder.it = builder.test;
  builder.describe = builder.group;

  Core.start = function (testCases, runNextWrapper) {
    let tests = Core._tests = [],
        promise, _runNext,
        next = 0;


    for(let i = 0; i < testCases.length; ++i) {
      const tc = testCases[i];
      if (! tc) continue;

      currentTc = tc;

      if (typeof tc.option === 'function')
        tc.option(builder);
      else
        tc.add(tc.option);
    }

    const tcs = [];

    Core.abnormalEnd = false;

    if (runNextWrapper) {
      runNextWrapper(function () {
        Core.runCallBacks('start');
        _runNext = function () {runNextWrapper(runNext)};
        _runNext();
      });
    } else {
      Core.runCallBacks('start');
      _runNext = function () {
        try {
          runNext();
        } catch(ex) {
          Core.abort(ex);
        }
      };
      _runNext();
      if (Core.abnormalEnd)
        Core.runCallBacks('end');;
    }

    function runNext(abort) {
      let around;
      while(! abort) {
        const test = tests[next++];
        if (! test) {
          for(let i = tcs.length-1; i !== -1; --i) {
            tcs[i].endTestCase();
          }
          Core.test = null;
          Core.runCallBacks('end');
          return;
        }

        if (! Core.test || Core.test.tc !== test.tc) {
          newTestCase(test.tc);
        }
        Core.lastTest = Core.test;
        Core.test = test;
        Core.runCallBacks('testStart', test);

        if (test.skipped) {
          test.success = true;
          Core.runCallBacks('testEnd', test);
          continue;
        } else {
          let ex;
          around = ! test.tc.runSetUp(test);
          if (test.func.length === 1) {
            if (around)
              throw new Error("setUpAround not supported on async tests");
            const promise = promiseFunc(test, _runNext);
            ex = runPromise(test, promise);
            if (! ex) {
              if (promise.done) continue;
              promise.timeout = setTimeout(function () {
                promise(new Error("Timed out!"));
              }, promise.maxTime || 2000);
              return;
            }
          } else {
            const {assertCount} = Core;
            ex = runSync(test, around);
            ex || checkAssertionCount(test, assertCount);
          }
          if (ex) {
            failed(test, ex);
          }
        }
        promise = null;
        abort = runTearDowns(test, around);
      }
    }

    function newTestCase(tc) {
      const i = tc.tc ? newTestCase(tc.tc) : 0;
      if (tcs[i] !== tc) {
        for(let j = tcs.length -1; j >= i; --j) {
          tcs[j].endTestCase();
        }
        tcs.length = i+1;
        tcs[i] = tc;
        tc.startTestCase();
      }
      return i+1;
    }
  };

  function runSync(test, around) {
    try {
      test.tc.runTest(test, test.func, around);
    } catch(ex) {
      return ex;
    }
  }

  function runPromise(test, promise) {
    try {
      test.tc.runTest(test, test.func, false, promise);
    } catch(ex) {
      return ex;
    }
  }

  function promiseFunc(test, runNext) {
    const {assertCount} = Core;
    function promise(ex) {
      promise.done = true;

      if (ex)
        failed(test, ex);
      else
        checkAssertionCount(test, assertCount);
      const abort = runTearDowns(test);

      if (promise.timeout) {
        clearTimeout(promise.timeout);

        if (abort) runNext(abort);
        else asyncNext(runNext);
      }
    };

    promise.wrap = wrapPromise;
    return promise;
  }

  function wrapPromise(func, _this) {
    const promise = this;
    return (...args) => {
      try {
        return func.apply(_this, args);
      }
      catch(ex) {
        promise(ex);
      }
    };
  }

  function failed(test, ex) {
    if (ex === 'abortTests')
      throw ex;
    test.success = false;
    test.errors = [Core.extractError(ex)];
  }

  function checkAssertionCount(test, assertCount) {
    if (assertCount === Core.assertCount) {
      test.success = false;
      test.errors = ["No assertions!"];
    } else {
      test.success = true;
    }
  }

  function runTearDowns(test, around) {
    try {
      if (! around) {
        test.tc.runOnEnds(test);
        test.tc.runTearDown(test);
      }
    } catch(ex) {
      if (test.success)
        failed(test, ex);
      else
        test.errors.push(Core.extractError(ex));
      Core.abnormalEnd = true;
      return 'abort';
    } finally {
      Core.runCallBacks('testEnd', test);
    }

  }
});

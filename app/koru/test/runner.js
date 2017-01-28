define(['./core'], function (geddon) {
  geddon.start = function (testCases, runNextWrapper) {
    var tests = geddon._tests = [],
        promise, _runNext,
        next = 0;

    for(var i = 0; i < testCases.length; ++i) {
      var tc = testCases[i];
      if (! tc) continue;
      if (typeof tc.option === 'function')
        tc.option(tc);
      else
        tc.add(tc.option);
    }

    var tcs = [];

    geddon.abnormalEnd = false;

    if (runNextWrapper) {
      runNextWrapper(function () {
        geddon.runCallBacks('start');
        _runNext = function () {runNextWrapper(runNext)};
        _runNext();
      });
    } else {
      geddon.runCallBacks('start');
      _runNext = function () {
        try {
          runNext();
        } catch(ex) {
          geddon.abort(ex);
        }
      };
      _runNext();
      if (geddon.abnormalEnd)
        geddon.runCallBacks('end');;
    }

    function runNext(abort) {
      while(! abort) {
        var test = tests[next++];
        if (! test) {
          for(var i = tcs.length-1; i !== -1; --i) {
            tcs[i].endTestCase();
          }
          geddon.test = null;
          geddon.runCallBacks('end');
          return;
        }

        if (! geddon.test || geddon.test.tc !== test.tc) {
          newTestCase(test.tc);
        }
        geddon.lastTest = geddon.test;
        geddon.test = test;
        geddon.runCallBacks('testStart', test);

        if (test.skipped) {
          test.success = true;
          geddon.runCallBacks('testEnd', test);
          continue;
        } else {
          var around = ! test.tc.runSetUp(test);
          if (test.func.length === 1) {
            if (around)
              throw new Error("setUpAround not supported on async tests");
            var promise = promiseFunc(test, _runNext);
            var ex = runPromise(test, promise);
            if (! ex) {
              if (promise.done) continue;
              promise.timeout = setTimeout(function () {
                promise(new Error("Timed out!"));
              }, promise.maxTime || 2000);
              return;
            }
          } else {
            var assertCount = geddon.assertCount;
            var ex = runSync(test, around);
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
      var i = tc.tc ? newTestCase(tc.tc) : 0;
      if (tcs[i] !== tc) {
        for(var j = tcs.length -1; j >= i; --j) {
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
    var assertCount = geddon.assertCount;
    var promise = function (ex) {
      promise.done = true;

      if (ex)
        failed(test, ex);
      else
        checkAssertionCount(test, assertCount);
      var abort = runTearDowns(test);

      if (promise.timeout) {
        clearTimeout(promise.timeout);

        if (abort) runNext(abort);
        else setTimeout(runNext, 0);
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
    test.errors = [geddon.extractError(ex)];
  }

  function checkAssertionCount(test, assertCount) {
    if (assertCount === geddon.assertCount) {
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
        test.errors.push(geddon.extractError(ex));
      geddon.abnormalEnd = true;
      return 'abort';
    } finally {
      geddon.runCallBacks('testEnd', test);
    }

  }
});

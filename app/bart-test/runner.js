define(['./core'], function (geddon) {
  var sinon = geddon.sinon;

  geddon.start = function (runNextWrapper) {
    var tests = geddon._tests = [],
        promise,
        next = 0;

    for(var key in geddon._testCases) {
      var tc = geddon._testCases[key];
      if (typeof tc.option === 'function')
        tc.option(tc);
      else
        tc.add(tc.option);
    }

    if (runNextWrapper)
      var _runNext = function () {runNextWrapper(runNext)};
    else
      var _runNext = runNext;

    _runNext();

    function runNext() {
      for(;;) {
        var test = tests[next++];
        if (! test) {
          geddon.runCallBacks('end');
          return;
        }

        geddon.test = test;
        geddon.runCallBacks('testStart', test);

        if (test.skipped) {
          test.success = true;
          geddon.runCallBacks('testEnd', test);
          continue;
        } else try {
          test.tc.runSetUp(test);
          if (test.func.length === 1) {
            var promise = promiseFunc(test, _runNext);
            test.func(promise);
            if (promise.done) continue;
            promise.timeout = setTimeout(function () {
              promise(new Error("Timed out!"));
            }, promise.maxTime || 2000);
            return;
          } else {
            var assertCount = geddon.assertCount;
            test.func(test);
            checkAssertionCount(test, assertCount);
          }
        } catch(ex) {
          failed(test, ex);
        }
        promise = null;
        runTearDowns(test);
      }
    }
  };

  function promiseFunc(test, runNext) {
    var assertCount = geddon.assertCount;
    var promise = function (ex) {
      promise.done = true;

      if (ex)
        failed(test, ex);
      else
        checkAssertionCount(test, assertCount);
      runTearDowns(test);

      if (promise.timeout) {
        clearTimeout(promise.timeout);
        runNext();
      }
    };

    promise.wrap = wrapPromise;
    return promise;
  }

  function wrapPromise(func, _this) {
    var promise = this;
    return function () {
      try {
        return func.apply(_this, arguments);
      }
      catch(ex) {
        promise(ex);
      }
    };
  }

  function failed(test, ex) {
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

  function runTearDowns(test) {
    try {
      var cbs = test.__testEnd;
      if (cbs) for(var i=0;i < cbs.length;++i) {
        cbs[i].call(test);
      }
      test.tc.runTearDown(test);
    } finally {
      geddon.runCallBacks('testEnd', test);
    }

  }
});

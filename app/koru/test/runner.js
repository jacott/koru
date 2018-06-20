define((require, exports, module)=>{
  const koru            = require('koru');
  const TestCase        = require('koru/test/test-case');
  const util            = require('koru/util');
  const Core            = require('./core');

  const isDone$ = Symbol(), timeout$ = Symbol();

  const MAX_TIME = 2000;

  const asyncNext = func => {koru.runFiber(func)};

  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

  let currentTc, skipped = false;

  const skipAdd = (name, func)=>{
    name = "test " + name.slice(2);
    if (skipped)
      return currentTc.add("test "+name.slice(2), func, true);
    else {
      try {
        return currentTc.add("test "+name.slice(2), func, skipped = true);
      } finally {
        skipped = false;
      }
    }
  };

  const builder = {
    beforeEach: body => currentTc.add('setUp', body),
    afterEach: body => currentTc.add('tearDown', body),
    before: body => currentTc.add('setUpOnce', body),
    after: body => currentTc.add('tearDownOnce', body),

    test: (name, body)=> name[0] === '/' && name[1] === '/'
      ? skipAdd(name, body) : currentTc.add("test "+name, body, skipped),

    group: (name, body)=>{
      const otc = currentTc;
      const os = skipped;
      if (name[0] === '/' && name[1] === '/') {
        skipped = true;
        name = name.slice(2);
      }
      const ntc = new TestCase(name, otc);
      try {
        currentTc = ntc;
        body(ntc);
        return ntc;
      } finally {
        skipped = os;
        currentTc = otc;
      }
    }
  };

  builder.it = builder.test;
  builder.describe = builder.group;

  Core.start = (testCases, runNextWrapper)=>{
    let tests = Core._tests = [],
        _runNext, next = 0;

    const runNext = (abort)=>{
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
            const done = doneFunc(test, _runNext);
            ex = runDone(test, done);
            if (ex === undefined) {
              if (done[isDone$]) continue;
              setDoneTimeout(done);
              return;
            }
          } else {
            const {assertCount} = Core;
            const ans = runSync(test, around);
            if (ans !== undefined) {
              if (typeof ans.then === 'function') {
                const done = doneFunc(test, _runNext);
                setDoneTimeout(done);
                ans.then(()=>{done()}, done);
                return;
              }
              ex = ans;
            } else {
              checkAssertionCount(test, assertCount);
            }
          }
          if (ex !== undefined) failed(test, ex);
        }
        abort = runTearDowns(test, around);
      }
    };

    const newTestCase = (tc)=>{
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
    };

    for(let i = 0; i < testCases.length; ++i) {
      const tc = testCases[i];
      if (! tc) continue;

      currentTc = tc;

      try {
        if (typeof tc.body === 'function')
          tc.body(builder);
        else
          tc.add(tc.body);
      } catch (ex) {
        failed(tc, ex);
        throw ex;
      }
    }

    const tcs = [];

    Core.abnormalEnd = false;

    if (runNextWrapper) {
      runNextWrapper(()=>{
        Core.runCallBacks('start');
        _runNext = ()=>{runNextWrapper(runNext)};
        _runNext();
      });
    } else {
      Core.runCallBacks('start');
      _runNext = ()=>{
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

  };

  const runSync = (test, around)=>{
    try {
      return test.tc.runTest(test, test.func, around);
    } catch(ex) {
      return ex;
    }
  };

  const runDone = (test, done)=>{
    try {
      test.tc.runTest(test, test.func, false, done);
    } catch(ex) {
      return ex;
    }
  };

  const doneFunc = (test, runNext)=>{
    const {assertCount} = Core;
    const done = ex =>{
      done[isDone$] = true;

      if (ex)
        failed(test, ex);
      else
        checkAssertionCount(test, assertCount);
      const abort = runTearDowns(test);

      if (done[timeout$] !== undefined) {
        clearTimeout(done[timeout$]);

        if (abort) runNext(abort);
        else asyncNext(runNext);
      }
    };
    done.maxTime = MAX_TIME;

    return done;
  };

  const setDoneTimeout = (done)=>{
    done[timeout$] = setTimeout(
      ()=>{done(new Error("Timed out!"))}, done.maxTime);
  };


  const failed = (test, ex)=>{
    if (ex === 'abortTests') throw ex;
    test.success = false;
    test.errors = [
      (ex instanceof Error) ? util.extractError(ex) : 'Unexpected return value: '+util.inspect(ex)];
  };

  const checkAssertionCount = (test, assertCount)=>{
    if (assertCount === Core.assertCount) {
      test.success = false;
      let line = 1;
      const name = test._currentTestCase.topTestCase().name+'-test';
      const mod = module.get(name);
      if (mod != null) {
        const tcbody = mod.body.toString();
        const testName = test.name.replace(/^.*?\btest /, '').slice(0, -1);
        const testbody = `test("${testName}", ${test.func.toString()}`;

        let idx = tcbody.indexOf(testbody);

        if (idx !== -1) {
          for (let ni = tcbody.indexOf("\n"); ni !== -1 && ni < idx;
               ni = tcbody.indexOf("\n", ni+1)) {
            ++line;
          }
        }
      }

      test.errors = [
        "Failure: No assertions\n    at - "+
          `test.func (${name}.js:${line}:1)`
      ];
    } else {
      test.success = true;
    }
  };

  const runTearDowns = (test, around)=>{
    try {
      if (! around) {
        test.tc.runOnEnds(test);
        test.tc.runTearDown(test);
      }
    } catch(ex) {
      if (test.success)
        failed(test, ex);
      else
        test.errors.push(util.extractError(ex));
      Core.abnormalEnd = true;
      return 'abort';
    } finally {
      Core.runCallBacks('testEnd', test);
    }
  };
});

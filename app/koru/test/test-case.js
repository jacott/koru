define((require, exports, module)=>{
  const koru            = require('koru');
  const LinkedList      = require('koru/linked-list');
  const Core            = require('koru/test/core');
  const stubber         = require('koru/test/stubber');
  const util            = require('koru/util');

  const timeout$ = Symbol(), isDone$ = Symbol(),
        after$ = Symbol(), once$ = Symbol(), temp$ = Symbol(), before$ = Symbol();

  const MAX_TIME = 2000;

  const asyncNext = func => {koru.runFiber(func)};

  let currentTC, isOnce = false, tests;

  const failed = (test, ex)=>{
    if (ex === 'abortTests') throw ex;
    test.success = false;
    test.errors = [
      (ex instanceof Error) ? util.extractError(ex) : 'Unexpected return value: '+util.inspect(ex)];
  };

  const checkAssertionCount = (test, assertCount)=>{
    if (assertCount !== Core.assertCount) {
      test.success = true;
    } else {
      test.success = false;

      const {name, line} = test.location;

      test.errors = [
        "Failure: No assertions\n    at - "+
          `test.func (${name}.js:${line}:1)`
      ];
    }
  };

  const runCallbacks = (list)=>{
    const {test} = Core;
    if (list === undefined) return;
    let prev;
    for (let node = list.front; node !== undefined; node = node.next) {
      if (node[temp$] === true)
        list.removeNode(node, prev);
      else
        prev = node;
      const {value} = node;
      if (typeof value === 'function') {
        value.call(test);
      } else if (Array.isArray(value)) {
        for(let i = value.length-1; i >=0 ; --i) {
          const func = value[i];
          if (typeof func === 'function') {
            func.call(test);
          } else {
            func.stop();
          }
        }
      } else {
        value.stop();
      }
    }
  };

  const runOnceCallbacks = (list)=>{
    try {
      isOnce = true;
      runCallbacks(list);
    } finally {
      isOnce = false;
    }
  };

  const runTearDowns = (tc, common)=>{
    currentTC = tc;
    if (tc === undefined) return;

    const sameTC = tc === common;
    const once = tc[once$];

    runCallbacks(tc[after$]);

    if (sameTC) {
      if (once !== undefined) return;
    } else {
      once === undefined || runOnceCallbacks(once.after);
    }
    const p = tc.tc;
    if (p === undefined) {
      common === undefined && reset(tc);
    } else
      runTearDowns(p, sameTC ? p : common);
  };

  const runSetups = (tc, common)=>{
    currentTC = tc;
    if (tc === undefined) return;

    const sameTC = tc === common;
    const once = tc[once$];


    if (! sameTC || once === undefined) {
      const p = tc.tc;
      runSetups(p, sameTC ? p : common);
      currentTC = tc;
      once === undefined || runOnceCallbacks(once.before);
    }
    runCallbacks(tc[before$]);
  };

  const commonTC = (ot, nt)=>{
    if (ot === undefined || nt === undefined)
      return;

    let otc = ot.tc, ntc = nt.tc;

    if (otc === undefined || ntc === undefined)
      return;

    while (ntc.level > otc.level) ntc = ntc.tc;
    while (otc.level > ntc.level) otc = otc.tc;

    while (ntc !== otc) {
      ntc = ntc.tc; otc = otc.tc;
    }

    return ntc;
  };

  const once = (tc)=> tc[once$] || (tc[once$] = {before: new LinkedList, after: new LinkedList});
  const before = (tc, func)=> (tc[before$] || (tc[before$] = new LinkedList)).addBack(func);
  const after = (tc, func)=> (tc[after$] || (tc[after$] = new LinkedList)).addFront(func);

  const reset = (tc)=>{
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
      while(top.tc != null) top = top.tc;
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

      name = 'test '+name+'.';
      Object.defineProperty(body, "name", {value: name});

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
      return this.tc ? this.tc.moduleId : this.name+'-test';
    }
  }

  const restorSpy = spy => ()=>{spy.restore && spy.restore()};

  Core.testCase = (name, body)=> new TestCase(name, undefined, body);

  Object.defineProperty(Core, 'currentTestCase', {get: () => currentTC});

  class Test {
    constructor(name, tc, func) {
      this.name = name;
      this.tc = tc;
      this.topTC = tc.topTestCase();
      this.func = func;
      this.mode = 'init';
    }

    onEnd(func) {
      const tc = currentTC || this.tc;
      (isOnce
       ? once(tc).after.addFront(func)
       : after(tc, func)
      )[temp$] = true;
    }

    spy(...args) {
      const spy = stubber.spy.apply(stubber, args);
      this.onEnd(restorSpy(spy));
      return spy;
    }

    stub(...args) {
      const spy = stubber.stub.apply(stubber, args);
      this.onEnd(restorSpy(spy));
      return spy;
    }

    intercept(...args) {
      const spy = stubber.intercept.apply(stubber, args);
      this.onEnd(restorSpy(spy));
      return spy;
    }

    get location() {
      let line = 1;
      const name = this.moduleId;
      const mod = module.get(name);
      if (mod != null) {
        const tcbody = mod.body.toString();
        const testName = this.name.replace(/^.*?\btest /, '').slice(0, -1);
        const testbody = `test("${testName}", ${this.func.toString()}`;

        let idx = tcbody.indexOf(testbody);

        if (idx !== -1) {
          for (let ni = tcbody.indexOf("\n"); ni !== -1 && ni < idx;
               ni = tcbody.indexOf("\n", ni+1)) {
            ++line;
          }
        }
      }

      return {name, line};
    }

    get moduleId() {return this.topTC.moduleId;}
  };

  let skipped = false;

  const expandTestCase = (tc, skipped=false)=>{
    const origTC = currentTC;
    currentTC = tc;

    builder.exec(tc.body);

    currentTC = origTC;
  };

  const builder = {
    // aroundEach: body => currentTC.add('setUpAround', body),
    beforeEach: body => currentTC.beforeEach(body),
    afterEach: body => currentTC.afterEach(body),
    before: body => currentTC.before(body),
    after: body => currentTC.after(body),

    test: (name, body)=> currentTC.addTest(name, body, skipped),

    group: (name, body)=>{
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

    exec: body=>{
      if (typeof body === 'function') {
        body(builder);
      } else for (const name in body) {
        const value = body[name];
        if (typeof value === 'function') {
          switch(name) {
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
            if (! name.startsWith("test ")) {
              Core.fail('misnamed test '+currentTC.fullName(name));
            }
            builder.test(name.slice(5), value);
          }
        } else {
          expandTestCase(new TestCase(name, currentTC, value));
        }
      }
    },
  };

  builder.it = builder.test;
  builder.describe = builder.group;

  const doneFunc = (test, runNext)=>{
    const {assertCount} = Core;
    const done = ex =>{
      done[isDone$] = true;

      if (ex)
        failed(test, ex);
      else
        checkAssertionCount(test, assertCount);

      if (done[timeout$] !== undefined) {
        clearTimeout(done[timeout$]);

        asyncNext(runNext);
      }
    };
    done.maxTime = MAX_TIME;

    return done;
  };

  const setDoneTimeout = (done)=>{
    done[timeout$] = setTimeout(
      ()=>{done(new Error("Timed out!"))}, done.maxTime);
  };


  Core.start = (testCases, runNextWrapper)=>{
    tests = [];
    Core.test = undefined;
    let _runNext, nt = 0;
    let lastTest;

    const runTest = (oldTest, newTest)=>{
      const common = commonTC(oldTest, newTest);
      if (oldTest !== undefined) {
        oldTest.mode = 'after';
        runTearDowns(oldTest.tc, common);
        Core.runCallBacks('testEnd', oldTest);
      }
      if (newTest === undefined) {
        lastTest = Core.test = tests = undefined;
        Core.runCallBacks('end');
      } else {
        newTest.mode = 'before';
        Core.runCallBacks('testStart', newTest);
        runSetups(newTest.tc, common);
        newTest.mode = 'running';
        try {
          if (newTest.func.length === 1) {
            const done = doneFunc(newTest, _runNext);
            const ans = newTest.func(done);
            if (ans !== undefined)
              failed(newTest, ans);
            else {
              if (done[isDone$]) return;
              setDoneTimeout(done);
              return true;
            }
          } else {
            const {assertCount} = Core;
            const ans = newTest.func();
            if (ans === undefined) {
              checkAssertionCount(newTest, assertCount);
            } else {
              if (typeof ans.then === 'function') {
                const done = doneFunc(newTest, _runNext);
                setDoneTimeout(done);
                ans.then(()=>{done()}, done);
                return true;
              }
              failed(newTest, ans);
            }
          }
        } catch(ex) {
          failed(newTest, ex);
        }
      }
    };

    const runNext = ()=>{
      while(true) {
        if (nt == tlen) {
          runTest(Core.test);
          return;
        }
        lastTest = Core.test;
        Core.test = tests[nt++];
        try {
          if (runTest(lastTest, Core.test)) return;
        } catch(ex) {
          if (currentTC !== undefined)
            ex.message = `While running test case ${currentTC.fullName()}:\n${ex.message}`;
          throw ex;
        }
      }
    };

    for(let i = 0; i < testCases.length; ++i) {
      const tc = testCases[i];
      if (tc === undefined) continue;

      skipped = false;

      expandTestCase(tc);
    }

    const tlen = tests.length;

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
    }

  };


  return TestCase;
});

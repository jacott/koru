define(['./core', './stubber'], function (geddon, stubber) {

  class TestCase {
    constructor(name, tc, option) {
      this.name = name;
      this.tc = tc;
      this.option = option;
      this._before = null;
      this._after = null;
    }

    fullName(name) {
      var ret = this.tc ? this.tc.fullName(this.name) : this.name;
      return name ? ret + ' ' + name : ret;
    }

    before(func) {
      (this._before = this._before || []).push(func);
      return this;
    }

    after(func) {
      (this._after = this._after || []).push(func);
      return this;
    }

    startTestCase() {
      var before = this._before;
      if (before) for(var i = 0; i < before.length; ++i) {
        before[i].call(this);
      }
    }

    endTestCase() {
      if (this._setUpOnce) {
        this._setUpOnce = null;
        this.tc && this.tc.runTearDown();
      }
      var after = this._after;
      if (after) for(var i = 0; i < after.length; ++i) {
        after[i].call(this);
      }
    }

    runSetUp(test) {
      if (this.setUpAround) return false;
      if (! this._setUpOnce) {
        if (this.tc && ! this.tc.runSetUp(test))
          return false;
        test._currentTestCase = this;
        if (this.setUpOnce) {
          this._setUpOnce = true;
          this.setUpOnce.call(test);
        }
      }
      this.setUp && this.setUp.call(test);
      return true;
    }

    runTest(test, func, around, done) {
      if (! around) {
        func.call(test, done);
        return;
      }

      for(var tc = this; tc; tc = tc.tc) {
        if (tc.tc)
          tc.tc.runTest(test, function () {
            tc.runSetUpArround(test, func);
          }, true);
        else
          tc.runSetUpArround(test, func);
        return;
      }
    }

    runSetUpArround(test, func) {
      var tex;
      var tc = this;
      if (tc.setUpAround) {
        test._currentTestCase = tc;
        tc.setUpAround.call(test, doit);
      } else
        doit();

      if (tex) throw tex;

      function doit() {
        var onEnds = test.__testEnd;
        test.__testEnd = null;
        try {
          if (tc.setUp) {
            test._currentTestCase = tc;
            tc.setUp.call(test);
          }
          try {
            func.call(test);
          } finally {
            tc.runOnEnds(test);
            tc.tearDown && tc.tearDown.call(test);
          }
        } catch(ex) {
          tex = ex;
        } finally {
          test.__testEnd = onEnds;
        }
      }
    }

    runOnEnds(test) {
      var cbs = test.__testEnd;
      if (cbs) for(var i=0;i < cbs.length;++i) {
        var func = cbs[i];
        if (typeof func === 'function')
          func.call(test);
        else if (! func || typeof func.stop !== 'function')
          throw new Error("test.onEnd called with non function or object.stop function");
        else
          func.stop();
      }
    }

    runTearDown(test) {
      this.tearDown && this.tearDown.call(test);
      if (this._setUpOnce) return;
      this.tc && this.tc.runTearDown(test);
    }

    add(name, func, skipped) {
      if (typeof name === 'string' && name.match(/^\/\//)) {
        skipped = true;
        name = name.slice(2);
      }

      if (typeof func === 'function') {

        switch(name) {
        case 'setUp': case 'tearDown': case 'setUpAround':
        case 'setUpOnce': case 'tearDownOnce':
          skipped || (this[name] = func);
          break;
        default:
          if (! geddon.runArg || this.fullName(name).indexOf(geddon.runArg) !== -1) {

            ++geddon.testCount;
            if (skipped) {
              ++geddon.skipCount;
              geddon._tests.push(new Test(this.fullName(name), this));
            } else {
              geddon._tests.push(new Test(this.fullName(name), this, func));
            }
          }
        }
      } else if (func != null) {

        new TestCase(name, this).add(func, null, skipped);
      } else {

        for(var opId in name) {
          this.add(opId, name[opId], skipped);
        }
      }
      return this;
    }

    get moduleId() {
      return this.tc ? this.tc.moduleId : this.name+'-test';
    }
  }

  class Test {
    constructor(name, tc, func) {
      this.name = name;
      this.tc = tc;
      this.func = func;
      this._currentTestCase = this.__testEnd = null;
    }

    get skipped() {
      return ! this.func;
    }

    onEnd(func) {
      (this.__testEnd|| (this.__testEnd = [])).push(func);
    }

    spy() {
      var spy = stubber.spy.apply(stubber, arguments);
      this.onEnd(restorSpy(spy));
      return spy;
    }

    stub() {
      var spy = stubber.stub.apply(stubber, arguments);
      this.onEnd(restorSpy(spy));
      return spy;
    }

    intercept() {
      var spy = stubber.intercept.apply(stubber, arguments);
      this.onEnd(restorSpy(spy));
      return spy;
    }

    get moduleId() {return this.tc.moduleId;}
  };

  function restorSpy(spy) {
    return function() {
      spy.restore && spy.restore();
    };
  }

  geddon.testCase = function (name, option) {
    return new TestCase(name, null, option);
  };

});

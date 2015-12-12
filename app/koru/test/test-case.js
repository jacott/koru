define(['./core'], function (geddon) {
  var sinon = geddon.sinon;

  geddon.testCase = function (name, option) {
    var tc = new TestCase(name, null, option);
    geddon._testCases[name] = tc;

    return tc;
  };

  geddon.unloadTestcase = function (name) {
    delete geddon._testCases[name];
  };

  function TestCase (name, tc, option) {
    this.name = name;
    this.tc = tc;
    this.option = option;
  };

  TestCase.prototype = {
    constructor: TestCase,

    fullName: function (name) {
      var ret = this.tc ? this.tc.fullName(this.name) : this.name;
      return name ? ret + ' ' + name : ret;
    },

    before: function (func) {
      (this._before = this._before || []).push(func);
      return this;
    },

    after: function (func) {
      (this._after = this._after || []).push(func);
      return this;
    },

    startTestCase: function () {
      var before = this._before;
      if (before) for(var i = 0; i < before.length; ++i) {
        before[i].call(this);
      }
    },

    endTestCase: function () {
      var after = this._after;
      if (after) for(var i = 0; i < after.length; ++i) {
        after[i].call(this);
      }
    },

    runSetUp: function (test) {
      if (this.setUpAround) return false;
      if (this.tc && ! this.tc.runSetUp(test))
        return false;
      this.setUp && this.setUp.call(test);
      return true;
    },

    runTest: function (test, func, around, done) {
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
    },

    runSetUpArround: function (test, func) {
      var tex;
      var tc = this;
      if (tc.setUpAround)
        tc.setUpAround.call(test, doit);
      else
        doit();

      if (tex) throw tex;

      function doit() {
        var onEnds = test.__testEnd;
        test.__testEnd = null;
        try {
          tc.setUp && tc.setUp.call(test);
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
    },

    runOnEnds: function (test) {
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
    },

    runTearDown: function (test) {
      this.tearDown && this.tearDown.call(test);
      this.tc && this.tc.runTearDown(test);
    },

    add: function (name, func) {
      if (typeof name === 'string' && name.match(/^\/\//)) {
        var skipped = true;
        name = name.slice(2);
      }

      if (typeof func === 'function') {

        switch(name) {
        case 'setUp': case 'tearDown': case 'setUpAround':
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

        var option = name;
        for(name in option) {
          this.add(name, option[name], skipped);
        }
      }
      return this;
    },
  };

  function Test(name, tc, func) {
    this.name = name;
    this.tc = tc;
    this.func = func;
  }

  Test.prototype = {
    constructor: TestCase,

    get skipped() {return ! this.func},

    onEnd: function (func) {
      (this.__testEnd|| (this.__testEnd = [])).push(func);
    },

    spy: function () {
      var spy = sinon.spy.apply(sinon, arguments);
      this.onEnd(restorSpy(spy));
      return spy;
    },

    stub: function () {
      var spy = sinon.stub.apply(sinon, arguments);
      this.onEnd(restorSpy(spy));
      return spy;
    },
  };

  function restorSpy(spy) {
    return function() {
      spy.restore && spy.restore();
    };
  }


});

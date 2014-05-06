define(['./core'], function (geddon) {
  var testCases = {},
      sinon = geddon.sinon;

  geddon.testCase = function (name, option) {
    var tc = new TestCase(name);
    testCases[name] = tc;
    if (typeof option === 'function')
      option(tc);
    else
      tc.add(option);

    return tc;
  };

  function TestCase (name, tc) {
    this.name = name;
    this.tc = tc;
  };

  TestCase.prototype = {
    constructor: TestCase,

    fullName: function (name) {
      var ret = this.tc ? this.tc.fullName(this.name) : this.name;
      return name ? ret + ' ' + name : ret;
    },

    runSetUp: function (test) {
      this.tc && this.tc.runSetUp(test);
      this.setUp && this.setUp.call(test);
    },

    runTearDown: function (test) {
      this.tearDown && this.tearDown.call(test);
      this.tc && this.tc.runTearDown(test);
    },

    add: function (name, func, skipped) {
      if (typeof name === 'string' && name.match(/^\/\//)) {
        skipped = true;
        name = name.slice(2);
      }

      if (typeof func === 'function') {

        if (name === 'setUp' || name === 'tearDown') {
          skipped || (this[name] = func);
        } else if (! geddon.runArg || this.fullName(name).indexOf(geddon.runArg) !== -1) {

          ++geddon.testCount;
          if (skipped) {
            ++geddon.skipCount;
            geddon._tests.push(new Test(this.fullName(name), this));
          } else {
            geddon._tests.push(new Test(this.fullName(name), this, func));
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

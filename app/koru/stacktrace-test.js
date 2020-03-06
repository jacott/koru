define((require, exports, module)=>{
  'use strict';
  /**
   * Stacktrace provides methods to normalize stack frames from different browsers and nodejs. Koru
   * normalizes error messages before displaying them in logs using {#koru/util.extractError} and
   * {#koru/test/core::AssertionError}.
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util, match: m} = TH;

  const Stacktrace = require('./stacktrace');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("normalize", ()=>{
      /**
       * Normalize the stack trace for an `error`. See {#.elideFrames} and {#.replaceStack} for
       * manipulation of the stack trace. By default other frames are elided from the trace when
       * they are part of Koru's internal workings; to see a full stack trace set
       * {#koru/util;.FULL_STACK} to true.
       *
       * See {#koru/util.extractError}

       * @returns a normalized array of stack frames
       **/
      api.method();
      //[
      const inner1 = ()=>{inner2()};
      const inner2 = ()=>{inner3()};
      const inner3 = ()=>{
        throw new TH.Core.AssertionError("I failed");
      };

      try {
        inner1();
      } catch(err) {
        assert.equals(Stacktrace.normalize(err), [
          m(/    at .*inner3.* \(koru\/stacktrace-test.js:\d+:\d+\)/),
          m(/    at .*inner2.* \(koru\/stacktrace-test.js:\d+:\d+\)/),
          m(/    at .*inner1.* \(koru\/stacktrace-test.js:\d+:\d+\)/),
          m(/    at .*(Test\.test normalize|anonymous).* \(koru\/stacktrace-test.js:\d+:\d+\)/),
        ]);

        assert.same(Stacktrace.normalize(err), Stacktrace.normalize(err));
      }
      //]
    });

    test("elideFrames", ()=>{
      /**
       * Elide the top `count` frames from an `error`'s {#.normalize;d} stack frame

       * @param error the Error to elide from
       **/
      api.method();
      //[
      const inner1 = ()=>{inner2()};
      const inner2 = ()=>{inner3()};
      const inner3 = ()=>{
        throw new TH.Core.AssertionError("I have a shortened customStack");
      };
      try {
        inner1();
      } catch(err) {
        Stacktrace.elideFrames(err, 2);

        assert.equals(Stacktrace.normalize(err), [
          m(/    at .*inner1.* \(koru\/stacktrace-test.js:\d+:\d+\)/),
          m(/    at .*(Test\.test elideFrames|anonymous).* \(koru\/stacktrace-test.js:\d+:\d+\)/),
        ]);
      }
      //]
    });

    test("replaceStack", ()=>{
      /**
       * Replace the {#.normalize;d} stack frame.

       * @param error the Error who's frame is to be replaced.

       * @param replacementError the Error with the normalized stack frame to use.
       **/
      api.method();
      //[
      const inner1 = ()=>{inner2()};
      const inner2 = ()=>{inner3()};
      const inner3 = ()=>{
        const err = new Error("I failed");

        const err2 = (()=> new Error("I use another stack"))();
        Stacktrace.replaceStack(err2, err);
        assert.same(Stacktrace.normalize(err2), Stacktrace.normalize(err));
      };
      inner1();
      //]
    });
  });
});

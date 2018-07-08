define((require, exports, module)=>{
  /**
   * A group of tests. Most methods are for internal purposes and are not documented here.
   *
   * See {#koru/test-helper}
   **/
  const api             = require('koru/test/api');
  const TH              = require('./main');

  const {stub, spy, onEnd, util, stubProperty, match: m} = TH;

  const sut  = require('./test-case');

  let v = {};

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=> {
    let groupDone;

    group("nested groups", ()=>{
      let text = '\n';
      let level = '';
      groupDone = false;

      const msg = (msg, ind=0)=>{
        assert.same(typeof ind, 'number');
        if (ind < 0) level = level.slice(0, -2);
        text += level+msg+'\n';
        if (ind > 0) level+= '  ';
      };

      before(()=>{
        msg('before');
      });

      before(()=>{msg('b2', 1); onEnd(()=>{msg('b2-oe-'+TH.Core.currentTestCase.name)})});

      after(()=>{
        msg('after');
        assert.equals(text, `
before
b2
  beforeEach
    one
    beforeEach-oe-nested groups
  afterEach
  beforeEach
    g2-before
    g2-be1
    g2-be2
      g2-1
      g2-be2-oe-g2
    g2-ae2
    g2-ae1
    g2-be1
    g2-be2
      g2-2
      g2-be2-oe-g2
    g2-ae2
    g2-ae1
    g2-after
    beforeEach-oe-nested groups
  afterEach
  beforeEach
    two
    beforeEach-oe-nested groups
  afterEach
  b2-oe-nested groups
a2
after
`);

        text = '\n';
        groupDone = true;
      });

      after(()=>{msg('a2', -1)});

      beforeEach(()=>{
        assert.equals(TH.Core.currentTestCase.name, 'nested groups');
        onEnd(()=>{msg('beforeEach-oe-'+TH.Core.currentTestCase.name)});
        msg('beforeEach', 1);});

      afterEach(()=>{msg('afterEach', -1)});

      test("one", ()=>{msg('one')});

      group("g2", ()=>{
        before(()=>{msg('g2-before')});
        beforeEach(()=>{msg('g2-be1')});
        beforeEach(()=>{
          assert.equals(TH.Core.currentTestCase.name, 'g2');

          msg('g2-be2', 1);
          onEnd(()=>{msg('g2-be2-oe-'+TH.Core.currentTestCase.name)});
        });

        after(()=>{msg('g2-after')});
        afterEach(()=>{msg('g2-ae1')});
        afterEach(()=>{msg('g2-ae2', -1)});

        test("g2-1", ()=>{msg("g2-1")});

        test("g2-2", ()=>{msg("g2-2")});
      });

      test("two", ()=>{msg('two')});
    });

    test("nested-group finished", ()=>{
      assert.isTrue(groupDone);
    });

    beforeEach(()=>{
    });

    afterEach(()=>{
      v = {};
    });

    group("sub-test-case", ()=>{
      test("moduleId", ()=>{
        api.protoProperty('moduleId', {info: 'the id of the module this test-case is defined in'});
        assert.same(TH.test.tc.moduleId, 'koru/test/test-case-test');
      });

      test("fullName", ()=>{
        /**
         * Get the name of the test-case prefixed by the parent test-cases (if any).
         **/
        api.protoMethod();
        assert.same(TH.test.tc.fullName(), 'koru/test/test-case sub-test-case');
      });

      test("topTestCase", ()=>{
        /**
         * Retrieve the top most `TestCase`
         **/
        api.protoMethod();
        assert.same(TH.test.tc.topTestCase().fullName(), 'koru/test/test-case');

      });
    });

    group("Test", ()=>{
      let tapi;

      before(()=>{
        tapi = api.innerSubject(TH.test.constructor, 'Test', {
          abstract() {
            /**
             * The Test facilitator responsible for running an individual test. Use
             * {#koru/test-helper}.test to access it. It can also be accessed from
             * `koru._TEST_.test`.
             *
             * Most methods are for internal purposes and are not documented here. But the name is
             * useful for debugging.
             **/
          }
        });
      });

      test("properties", ()=>{
        tapi.protoProperty('moduleId', {info: 'the id of the module this test is defined in'});
        assert.same(TH.test.moduleId, 'koru/test/test-case-test');

        const {name, tc} = TH.test;
        stubProperty(TH.test.constructor.prototype, 'name', {value: name});
        stubProperty(TH.test.constructor.prototype, 'tc', {value: tc});
        tapi.protoProperty('name', {info: 'the full name of the test'});
        assert.equals(TH.test.name, 'koru/test/test-case Test test properties.');

        tapi.protoProperty('tc', {info: 'the test-case containing this test'});
        assert.same(TH.test.tc.fullName(), 'koru/test/test-case Test');
      });
    });

    group("onEnd", ()=>{
      let onEndFinish;
      test("stop func", ()=>{
        onEndFinish = undefined;
        onEnd({stop() {--onEndFinish}});
        onEnd([()=>{--onEndFinish}, {stop: ()=>{--onEndFinish}}]);
        onEndFinish = 3;
        assert(true);
      });

      test("stop finished", ()=>{
        assert.same(onEndFinish, 0);
      });
    });

    group("empty test", ()=>{
      let emptyTest;
      after(()=>{
        assert.equals(emptyTest.errors, [m(/Failure: No assertions/)]);
        emptyTest.errors = undefined;
        emptyTest.success = true;
      });

      test("empty", ()=>{
        emptyTest = TH.test;
      });
    });

    group("done", ()=>{
      let doneFinish;
      let count = 2;

      afterEach(()=>{
        assert(--count >= 0);
      });

      test("done start", done =>{
        doneFinish = false;
        assert(true);
        setTimeout(()=>{doneFinish=true; done()}, 0);
      });

      test("done finished", ()=>{
        assert.isTrue(doneFinish);
      });
    });

    group("async", ()=>{
      let asyncFinish;

      test("async start", async ()=>{
        asyncFinish = false;
        let later = 4;
        const p = new Promise((resolve)=>{
          setTimeout(()=>{resolve(later)}, 0);
        });
        later = 5;

        assert.equals(await p, 5);
        asyncFinish = true;
      });

      test("async finished", ()=>{
        assert.isTrue(asyncFinish);
      });
    });
  });
});

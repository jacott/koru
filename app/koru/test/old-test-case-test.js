define((require, exports, module)=>{
  const TH              = require('./main');
  const TestCase        = require('./test-case');

  let v;
  TH.testCase(module, {
    setUp() {
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test setupOnce": {
      setUp() {
        v.count = 0;
      },

      tearDown() {
        assert.same(v.state, 'success');
        assert.same(v.count, 1);
        assert.same(v.eachCount, 2);
      },

      "Inner tc": {
        setUpOnce() {
          this.onEnd(() => {
            v.state += ' onEnd';
          });
          v.state = 'setup';
          ++v.count;
          v.eachCount = 0;
          v.tdState = null;
        },

        tearDownOnce() {
          v.tdState = 'done';
          assert.same(v.state, 'setup onEnd');
          assert.same(v.count, 1);


          v.state = 'success';
        },

        setUp() {
          v.eachSetup = true;
          v.eachCount += 2;
          this.onEnd(() => v.eachCount--);
        },

        "test one"() {
          assert.same(v.eachSetup, true);
          v.eachSetup = false;
          assert.same(v.state, 'setup');
          assert.same(v.tdState, null);
        },

        "test two"() {
          assert.same(v.eachSetup, true);
          v.eachSetup = false;
          assert.same(v.state, 'setup');
        },

      },
    },
  });
});

define(function (require, exports, module) {
  const TH   = require('./main');

  const TestCase = require('./test-case');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
    },

    tearDown() {
      v = null;
    },

    "testCase with body": {testCase(tc) {
      var xv;
      tc.add({
        setUp() {
          xv = "setup";
        },

        "test "() {
          assert.same(xv, 'setup');
        },
      });
    }},

    "test setupOnce": {
      setUp() {
        v.count = 0;
      },

      tearDown() {
        assert.same(v.state, 'success onEnd');
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
          assert.same(v.state, 'setup');
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

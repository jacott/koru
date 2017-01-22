define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var markdown = require('./markdown');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },


    "test getMentionIds"() {
      var md = "Hello @[Bob](123), how is @[Sally](567) but this is a [link](bad)";
      assert.equals(markdown.getMentionIds(md), ['123', '567']);
    },
  });
});

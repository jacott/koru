define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var markdown = require('./markdown');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },


    "test getMentionIds": function () {
      var md = "Hello @[Bob](123), how is @[Sally](567)";
      assert.equals(markdown.getMentionIds(md), ['123', '567']);
    },
  });
});

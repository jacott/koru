define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var sUtil = require('./server-util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test system": function () {
      v.stub = test.stub();
      sUtil.system('echo', ['10', '20'], function (data) {
        v.stub(data.toString());
      });

      assert.calledWith(v.stub, '10 20\n');
    },


    "test sleep": function () {
      var date = Date.now();
      sUtil.sleep(10);
      assert(Date.now()-date >= 10);
    },
  });
});

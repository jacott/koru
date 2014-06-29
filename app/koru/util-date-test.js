define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var uDate = require('./util-date');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test atHour": function () {
      var date = uDate.atHour(Date.UTC(2014,4,5), 6);
      assert.same(date.toISOString(), '2014-05-05T06:00:00.000Z');

      assert.same(uDate.atHour(5 + +date, 5).toISOString(), '2014-05-06T05:00:00.005Z');
    },

    "test atDowHour (at day of week, hour)": function () {
      var thu = 4;

      var date = uDate.atDowHour(Date.UTC(2014,4,5), thu, 9);
      assert.same(date.toISOString(), '2014-05-08T09:00:00.000Z');

      assert.same(uDate.atDowHour(123 + +date, thu, 8).toISOString(), '2014-05-15T08:00:00.123Z');

      var date = uDate.atDowHour(Date.UTC(2014,4,10), thu, 9);
      assert.same(date.toISOString(), '2014-05-15T09:00:00.000Z');
    },
  });
});

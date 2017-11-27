define(function (require, exports, module) {
  const TH    = require('./test');

  const uDate = require('./util-date');

  const MIN = 60*1000;
  const HOUR = MIN*60;
  const DAY = 24*HOUR;

  TH.testCase(module, {
    "test parse"() {
      assert.equals(uDate.parse('2017-12-26'), new Date(2017, 11, 26));
      assert.equals(uDate.parse('2017-12-26Z'), new Date("2017-12-26Z"));
    },

    "test shiftToLocale"() {
      assert.equals(uDate.shiftToLocale(new Date('2017-12-26T14:00Z')), new Date(2017, 11, 26, 14));
    },

    "test atUTCHour"() {
      const date = uDate.atUTCHour(Date.UTC(2014,4,5), 6);
      assert.same(date.toISOString(), '2014-05-05T06:00:00.000Z');

      assert.same(uDate.atUTCHour(5 + +date, 5).toISOString(), '2014-05-06T05:00:00.005Z');
    },

    "test toDiscreteDay"() {
      const dt = uDate.toDiscreteDay(123456789 + +new Date(2017, 2, 5, 15));

      assert.equals(dt, new Date(2017, 2, 7));
    },

    "test toDiscrete"() {
      const dt = new Date(2017, 2, 6, 13, 17, 36, 123);

      assert.equals(new Date(dt), new Date(2017, 2, 6, 13, 17, 36, 123));
      assert.equals(uDate.toDiscrete(dt, DAY), new Date(2017, 2, 6));
      assert.equals(uDate.toDiscrete(dt, HOUR), new Date(2017, 2, 6, 13));
      assert.equals(uDate.toDiscrete(dt, MIN), new Date(2017, 2, 6, 13, 17));
      assert.equals(uDate.toDiscrete(dt, 1000), new Date(2017, 2, 6, 13, 17, 36));
    },

    "test toSunday"() {
      const dt = uDate.toSunday(new Date(2017, 5, 2, 15));

      assert.equals(dt, new Date(2017, 4, 28));
      assert.equals(uDate.toSunday(new Date(2017, 4, 28)), new Date(2017, 4, 28));
    },

    "test atUTCDowHour (at day of week, hour)"() {
      const thu = 4;

      let date = uDate.atUTCDowHour(Date.UTC(2014,4,5), thu, 9);
      assert.same(date.toISOString(), '2014-05-08T09:00:00.000Z');

      assert.same(uDate.atUTCDowHour(123 + +date, thu, 8).toISOString(), '2014-05-15T08:00:00.123Z');

      date = uDate.atUTCDowHour(Date.UTC(2014,4,10), thu, 9);
      assert.same(date.toISOString(), '2014-05-15T09:00:00.000Z');
    },

    "test format"() {
      const d = new Date(2017, 0, 4, 14, 3, 12);
      const format = uDate.compileFormat('D MMM YYYY h:mma');
      assert.same(format(d), '4 Jan 2017 2:03pm');
      assert.same(format(12*HOUR + +d), '5 Jan 2017 2:03am');

      assert.same( uDate.format(d, `DD'YY hh`), `04'17 02`);
      assert.same( uDate.format(d, `m[m]`), `3m`);
    },

    "test from"() {
      assert.same(uDate.relative(0), 'a few seconds');
      assert.same(uDate.relative(44999), 'a few seconds');
      assert.same(uDate.relative(45000), 'a minute');
      assert.same(uDate.relative(89999), 'a minute');
      assert.same(uDate.relative(90000), '2 minutes');
      assert.same(uDate.relative(44.5*MIN-1), '44 minutes');
      assert.same(uDate.relative(44.5*MIN), 'an hour');
      assert.same(uDate.relative(90*MIN-1), 'an hour');
      assert.same(uDate.relative(90*MIN), '2 hours');
      assert.same(uDate.relative(22.5*HOUR-1), '22 hours');
      assert.same(uDate.relative(22.5*HOUR), 'a day');
      assert.same(uDate.relative(36*HOUR-1), 'a day');
      assert.same(uDate.relative(36*HOUR), '2 days');
      assert.same(uDate.relative(26.5*DAY-1), '26 days');
      assert.same(uDate.relative(26.5*DAY), 'a month');
      assert.same(uDate.relative(45*DAY), 'a month');
      assert.same(uDate.relative(46*DAY), '2 months');
      assert.same(uDate.relative(319*DAY), '10 months');
      assert.same(uDate.relative(320*DAY), 'a year');
      assert.same(uDate.relative(548*DAY-1), 'a year');
      assert.same(uDate.relative(548*DAY), '2 years');
      assert.same(uDate.relative(5000*DAY), '14 years');
    },
  });
});

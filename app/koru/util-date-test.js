define((require, exports, module)=>{
  'use strict';
  const TH    = require('koru/test-helper');

  const uDate = require('./util-date');

  const MIN = 60*1000;
  const HOUR = MIN*60;
  const DAY = 24*HOUR;

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("parse", ()=>{
      assert.equals(uDate.parse('2017-12-26'), new Date(2017, 11, 26));
      assert.equals(uDate.parse('2017-12-26T00:00:00Z'), new Date("2017-12-26T00:00:00Z"));
    });

    test("shiftToLocale", ()=>{
      assert.equals(uDate.shiftToLocale(new Date('2017-12-26T14:00Z')), new Date(2017, 11, 26, 14));
    });

    test("atUTCHour", ()=>{
      const date = uDate.atUTCHour(Date.UTC(2014,4,5), 6);
      assert.same(date.toISOString(), '2014-05-05T06:00:00.000Z');

      assert.same(uDate.atUTCHour(5 + +date, 5).toISOString(), '2014-05-06T05:00:00.005Z');
    });

    test("toDiscreteDay", ()=>{
      const dt = uDate.toDiscreteDay(123456789 + +new Date(2017, 2, 5, 15));

      assert.equals(dt, new Date(2017, 2, 7));
    });

    test("toDiscrete", ()=>{
      const dt = new Date(2017, 2, 6, 13, 17, 36, 123);

      assert.equals(new Date(dt), new Date(2017, 2, 6, 13, 17, 36, 123));
      assert.equals(uDate.toDiscrete(dt, DAY), new Date(2017, 2, 6));
      assert.equals(uDate.toDiscrete(dt, HOUR), new Date(2017, 2, 6, 13));
      assert.equals(uDate.toDiscrete(dt, MIN), new Date(2017, 2, 6, 13, 17));
      assert.equals(uDate.toDiscrete(dt, 1000), new Date(2017, 2, 6, 13, 17, 36));
    });

    test("toSunday", ()=>{
      const dt = uDate.toSunday(new Date(2017, 5, 2, 15));

      assert.equals(dt, new Date(2017, 4, 28));
      assert.equals(uDate.toSunday(new Date(2017, 4, 28)), new Date(2017, 4, 28));
    });

    test("atUTCDowHour (at day of week, hour)", ()=>{
      const thu = 4;

      let date = uDate.atUTCDowHour(Date.UTC(2014,4,5), thu, 9);
      assert.same(date.toISOString(), '2014-05-08T09:00:00.000Z');

      assert.same(uDate.atUTCDowHour(123 + +date, thu, 8).toISOString(), '2014-05-15T08:00:00.123Z');

      date = uDate.atUTCDowHour(Date.UTC(2014,4,10), thu, 9);
      assert.same(date.toISOString(), '2014-05-15T09:00:00.000Z');
    });

    test("format", ()=>{
      const d = new Date(2017, 0, 4, 14, 3, 12);
      const format = uDate.compileFormat('D MMM YYYY h:mma', 'en');
      assert.same(format(d), '4 Jan 2017 2:03pm');
      assert.same(format(12*HOUR + +d), '5 Jan 2017 2:03am');

      assert.same( uDate.format(d, `DD'YY hh`), `04'17 02`);
      assert.same( uDate.format(d, `m[m]`), `3m`);
      assert.same( uDate.format(d, `MM`), `01`);
      assert.same( uDate.format(d, `ss`), `12`);
      assert.same( uDate.format(d, `s`), `12`);
      d.setSeconds(9);
      assert.same( uDate.format(d, `ss`), `09`);
      assert.same( uDate.format(d, `s`), `9`);

      assert.same(uDate.format(d, 'MMM'), Intl.DateTimeFormat(void 0, {month: 'short'}).format(d));
    });

    test("Intl format", ()=>{
      const d = new Date(2017, 0, 4, 14, 3, 12);
      const format = uDate.compileFormat({weekday: 'long'}, 'en');
      assert.same(format(d), 'Wednesday');

      if (isClient) {
        assert.same( uDate.format(d, {}, 'de'), `4.1.2017`);
        assert.same( uDate.format(d, {}, 'en-us'), `1/4/2017`);
      }
      assert.same( uDate.format(d, {}), Intl.DateTimeFormat().format(d));
    });

    test("relTime", ()=>{
      const {polyfillReltime} =  uDate[isTest];

      assert.same(polyfillReltime.format(36, 'hour'), 'in 36 hours');
      assert.same(polyfillReltime.format(-36, 'hour'), '36 hours ago');
      assert.same(polyfillReltime.format(0, 'hour'), 'this hour');
      assert.same(polyfillReltime.format(1, 'hour'), 'in 1 hour');
      assert.same(polyfillReltime.format(-1, 'hour'), '1 hour ago');


      assert.same(uDate.relative(0, 0), 'now');
      assert.same(uDate.relative(20000, 10000), 'in 20 seconds');
      assert.same(uDate.relative(0, 0), 'now');
      assert.same(uDate.relative(45000), 'in 1 minute');
      assert.same(uDate.relative(-45000), '1 minute ago');
      assert.same(uDate.relative(61*MIN), 'in 1 hour');
      assert.same(uDate.relative(90*MIN), 'in 2 hours');
      assert.same(uDate.relative(24*HOUR), 'tomorrow');
      assert.same(uDate.relative(48*HOUR), 'in 2 days');
      assert.same(uDate.relative(26*DAY), 'in 26 days');
      assert.same(uDate.relative(46*DAY), 'in 2 months');
      assert.same(uDate.relative(-319*DAY), '10 months ago');
      assert.same(uDate.relative(530*DAY), 'in 17 months');
      assert.same(uDate.relative(548*DAY), 'in 2 years');
      assert.same(uDate.relative(5000*DAY), 'in 14 years');
      assert.same(uDate.relative(-5000*DAY), '14 years ago');


      const thismin = uDate.relative(0) === 'this minute' ? 'this minute' : 'in 0 minutes';
      assert.same(uDate.relative(0), thismin);
      assert.same(uDate.relative(29000), thismin);
    });
  });
});

define((require, exports, module)=>{
  'use strict';
  /**
   * Utility date processing methods
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, stubProperty} = TH;

  const uDate = require('./util-date');

  const MIN = 60*1000;
  const HOUR = MIN*60;
  const DAY = 24*HOUR;

  const isUTC = new Date().getTimezoneOffset() == 0;
  const LANG = (isClient ? void 0 : (()=>{
    const LANG = process.env.LC_ALL || process.env.LC_TIME;
    return LANG
      ? LANG.replace(/[.:].*$/, '').replace(/_/, '-')
      : void 0;
  })()) || Intl.DateTimeFormat().resolvedOptions().locale;

  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{
    test("defaultLang", ()=>{
      /**
       * The default locale language for the browser or nodejs.  On nodejs the env variables
       * `LC_ALL` and `LC_TIME` will override the LANG default.
       **/
      api.property();

      assert.same(uDate.defaultLang, LANG);
    });

    test("parse", ()=>{
      /**
       * Convert string to date. Like `Date.parse` except assumes local timezone if none given

       * @param dateStr A string representing a simplification of the ISO 8601 calendar date
       * extended format (other formats may be used, but results are implementation-dependent).

       * @returns parsed `dateStr` with the local timezone.

       **/
      api.method();
      //[
      assert.equals(uDate.parse('2017-12-26'), new Date(2017, 11, 26));
      assert.equals(uDate.parse('2017-12-26T00:00:00Z'), new Date("2017-12-26T00:00:00Z"));
      //]
    });

    test("shiftToLocale", ()=>{
      /**
       * Treat UTC time as locale time; move the timezone without changing the locale time

       * @param date The date to shift

       * @returns with the local timezone
       **/
      api.method();
      //[
      assert.equals(uDate.shiftToLocale(new Date('2017-12-26T14:00Z')),
                    new Date(2017, 11, 26, 14));
      //]
    });

    test("shiftToUTC", ()=>{
      /**
       * Treat locale time as UTC time; move the timezone without changing the locale time

       * @param date The date to shift

       * @returns with the UTC timezone
       **/
      api.method();
      //[
      assert.equals(uDate.shiftToUTC(new Date(2017, 11, 26, 14)),
                    new Date('2017-12-26T14:00Z'));
      //]
    });

    test("atUTCHour", ()=>{
      const date = uDate.atUTCHour(Date.UTC(2014,4,5), 6);
      assert.same(date.toISOString(), '2014-05-05T06:00:00.000Z');

      assert.same(uDate.atUTCHour(5 + +date, 5).toISOString(), '2014-05-06T05:00:00.005Z');
    });

    test("toDiscreteDay", ()=>{
      /**
       * Return the `date` at the start of the day

       * @param date to discretize

       * @returns at the start of the day in local timezone
       **/
      const dt = uDate.toDiscreteDay(123456789 + +new Date(2017, 2, 5, 15));

      assert.equals(dt, new Date(2017, 2, 7));
    });

    test("toDiscrete", ()=>{
      /**
       * Return the `date` at the start of the `unit`

       * @param date to discretize

       * @param unit the part to set to zero (and the parts below)

       * @returns with parts set to zero
       **/
      api.method();
      //[
      const dt = new Date(2017, 2, 6, 13, 17, 36, 123);

      assert.equals(uDate.toDiscrete(dt, uDate.DAY), new Date(2017, 2, 6));
      assert.equals(uDate.toDiscrete(dt, uDate.HOUR), new Date(2017, 2, 6, 13));
      assert.equals(uDate.toDiscrete(dt, uDate.MIN), new Date(2017, 2, 6, 13, 17));
      assert.equals(uDate.toDiscrete(dt, uDate.SEC), new Date(2017, 2, 6, 13, 17, 36));
      //]
    });

    test("toSunday", ()=>{
      /**
       * Get the last start of sunday.

       * @param date to look for sunday from

       * @returns start of sunday in locale timezone.
       **/
      api.method();
      //[
      const dt = uDate.toSunday(new Date(2017, 5, 2, 15));

      assert.equals(dt, new Date(2017, 4, 28));
      assert.equals(uDate.toSunday(dt), new Date(2017, 4, 28));
      assert.equals(uDate.toSunday(new Date(2017, 4, 28)), new Date(2017, 4, 28));
      //]
    });

    test("atUTCDowHour", ()=>{
      /**
       * Find the time for a UTC `dow`, `hour` (day of week and hour) after `date`

       * @param date the date to start from

       * @param dow the desired UTC day of week. `sun=0, mon=1, ... sat=6`

       * @param hour the desired UTC hour of day

       * @returns a date which is >= `date` and its `getUTCDay()` equals `dow` and `getUTCHours`
       * equals `hour`
       **/
      api.method();
      //[
      const THU = 4;

      let date = uDate.atUTCDowHour(Date.UTC(2014,4,5), THU, 9);
      assert.same(date.toISOString(), '2014-05-08T09:00:00.000Z');

      assert.same(uDate.atUTCDowHour(123 + +date, THU, 8).toISOString(),
                  '2014-05-15T08:00:00.123Z');

      date = uDate.atUTCDowHour(Date.UTC(2014,4,10), THU, 9);
      assert.same(date.toISOString(), '2014-05-15T09:00:00.000Z');
      //]
    });

    test("compileFormat", ()=>{
      /**
       * Make a function that converts a date to text given a specified format.

       * @param format If an `object` then uses
       * [Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat)

       *
       * if a `string` can contain the following mnemonics:

       * * `D` 1 or 2 digit day of month

       * * `DD` 2 digit day of month

       * * `s` 1 digit seconds in minute

       * * `ss` 2 digit seconds in minute

       * * `MM` 2 digit month of year

       * * `MMM` short name for month of year

       * * `YYYY` 4 digit year

       * * `YY` 2 digit year

       * * `h` 1 or 2 digit hour of day

       * * `hh` 2 digit hour of day

       * * `m` 1 or 2 digit minute of hour

       * * `mm` 2 digit minute of hour

       * * `a` am or pm

       * * `A` AM or PM

       * @param lang A string with a BCP 47 language tag. Defaults to the browser's or nodejs's
       * default locale.

       * @returns A function that will format a given Date or epoch

       * ```js
       * date => computeString()
       * ```
       **/
      api.method();
      //[
      const d = new Date(2017, 0, 4, 14, 3, 12);
      const format = uDate.compileFormat('D MMM YYYY h:mma', 'en');
      assert.same(format(d), '4 Jan 2017 2:03pm');
      assert.same(format(12*HOUR + +d), '5 Jan 2017 2:03am');
      //]

      {
        //[
        const format = uDate.compileFormat({weekday: 'long'}, 'en');
        assert.same(format(d), 'Wednesday');
        //]
      }
    });

    group("format", ()=>{
      /**
       * Format time with a specified format

       * @param date format this date

       * @param format the format use. See {#.compileFormat}

       * @param lang A string with a BCP 47 language tag. Defaults to the browser's or nodejs's
       * default locale.
       **/

      before(()=>{
        api.method();
      });

      test("concise format", ()=>{
        //[
        const d = new Date(2017, 0, 4, 14, 3, 12);

        assert.same(uDate.format(d, 'D MMM YYYY h:mma'), '4 Jan 2017 2:03pm');
        assert.same(uDate.format(12*HOUR + +d, 'D MMM YYYY h:mma', 'en'), '5 Jan 2017 2:03am');

        assert.same(uDate.format(d, `DD'YY hh`), `04'17 02`);
        assert.same(uDate.format(d, `m[m]`), `3m`);
        assert.same(uDate.format(d, `MM`), `01`);
        assert.same(uDate.format(d, `ss`), `12`);
        assert.same(uDate.format(d, `s`), `12`);
        d.setSeconds(9);
        assert.same(uDate.format(d, `ss`), `09`);
        assert.same(uDate.format(d, `s`), `9`);

        assert.same(uDate.format(d, 'MMM'), Intl.DateTimeFormat(void 0, {month: 'short'}).format(d));
        //]
      });

      test("Intl format", ()=>{
        //[
        const d = new Date(2017, 0, 4, 14, 3, 12);
        const format = uDate.compileFormat({weekday: 'long'}, 'en');
        assert.same(format(d), 'Wednesday');

        if (isClient) {
          assert.same( uDate.format(d, {}, 'de'), `4.1.2017`);
          assert.same( uDate.format(d, {}, 'en-us'), `1/4/2017`);
        }
        assert.same( uDate.format(d, {}), Intl.DateTimeFormat(uDate.defaultLang).format(d));
        //]
      });
    });

    test("relative", ()=>{
      /**
       * convert time to a relative text
       **/
      api.method();
      const {polyfillReltime} =  uDate[isTest];

      assert.same(polyfillReltime.format(36, 'hour'), 'in 36 hours');
      assert.same(polyfillReltime.format(-36, 'hour'), '36 hours ago');
      assert.same(polyfillReltime.format(0, 'hour'), 'this hour');
      assert.same(polyfillReltime.format(1, 'hour'), 'in 1 hour');
      assert.same(polyfillReltime.format(-1, 'hour'), '1 hour ago');

      //[
      assert.same(uDate.relative(0, 0), 'now');
      assert.same(uDate.relative(20000, 10000, 'en'), 'in 20 seconds');
      assert.same(uDate.relative(499, 0), 'now');
      assert.same(uDate.relative(45000,), 'in 1 minute');
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

      // Not all browsers do the same thing
      const thismin = uDate.relative(0) === 'this minute' ? 'this minute' : 'in 0 minutes';
      assert.same(uDate.relative(0), thismin);
      assert.same(uDate.relative(29000), thismin);
      //]
    });
  });
});

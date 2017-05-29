define(function(require, exports, module) {
  const MIN = 60*1000;
  const HOUR = MIN*60;
  const DAY = 24*HOUR;
  const AVG_YEAR = 365.25*DAY;
  const AVG_MONTH = AVG_YEAR/12;

  const MONTH_NAMES = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

  const SPLITTER = /(D{1,2}|M{3}|Y{2,4}|h{1,2}|m{1,2}|s{1,3}|a)/;

  const tmpDate = new Date(0);

  const TOKENS = {
    D: ()=> ''+tmpDate.getDate(),
    DD: ()=> {
      const d = tmpDate.getDate();
      return (d < 10 ? '0' : '')+d;
    },
    MMM: ()=> ''+MONTH_NAMES[tmpDate.getMonth()],
    YYYY: ()=> ''+tmpDate.getFullYear(),
    YY: ()=> (''+tmpDate.getYear()).slice(-2),
    h: ()=> {
      const hours = tmpDate.getHours();
      return hours == 0 ? '12' : ''+(hours > 12 ? (hours - 12) : hours);
    },
    hh: ()=> {
      const h = TOKENS.h();
      return h.length == 1 ? '0'+h : h;
    },
    mm: ()=> {
      const min = tmpDate.getMinutes();
      return (min < 10 ? '0' : '')+min;
    },
    a: ()=> tmpDate.getHours() < 12 ? 'am' : 'pm',
  };

  const uDate = {
    MIN, HOUR, DAY,
    AVG_MONTH, AVG_YEAR,

    atHour(date, hour) {
      var orig = +date;
      date = new Date(orig);

      date.setUTCHours(hour);

      if (orig > +date)
        date = new Date(DAY + +date);

      return date;
    },

    atDowHour(date, dow, hour) {
      var orig = +date;
      date = new Date(orig);

      date.setUTCHours(hour);
      var day = ((dow - date.getUTCDay() + 7) % 7);

      date = DAY*day + +date;

      return new Date( (orig > date ? 7*DAY : 0) + date);
    },
    format(d, format) {
      return uDate.compileFormat(format)(d);
    },
    relative(delta) {
      if (delta < 0) delta = -delta;
      if (delta < 45000) return 'a few seconds';

      if (delta < 90000) return 'a minute';
      if (delta < 44.5*MIN) return `${Math.round(delta/MIN)} minutes`;

      if (delta < 90*MIN) return 'an hour';
      if (delta < 22.5*HOUR) return `${Math.round(delta/HOUR)} hours`;

      if (delta < 36*HOUR) return 'a day';
      if (delta < 26.5*DAY) return `${Math.round(delta/DAY)} days`;

      if (delta < 46*DAY) return 'a month';
      if (delta < 320*DAY) return `${Math.round(delta/AVG_MONTH)} months`;

      if (delta < 548*DAY) return 'a year';
      return `${Math.round(delta/AVG_YEAR)} years`;
    },
    compileFormat(format) {
      const parts = format.split(SPLITTER);
      const len = parts.length;
      for(let i = 0; i < len; ++i) {
        const token = TOKENS[parts[i]];
        if (token !== undefined) parts[i] = token;
      }

      return date => {
        tmpDate.setTime(+date);
        let ans = '';
        for(let i = 0; i < len; ++i) {
          const part = parts[i];
          ans+= typeof part === 'string' ? part : part();
        }
        return ans;
      };
    },
  };

  return uDate;
});

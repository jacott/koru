define((require)=>{
  const MIN = 60*1000;
  const HOUR = MIN*60;
  const DAY = 24*HOUR;
  const AVG_YEAR = 365.25*DAY;
  const AVG_MONTH = AVG_YEAR/12;

  const MONTH_NAMES = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

  const SPLITTER = /(\[.+?\]|D{1,2}|M{2,3}|Y{2,4}|h{1,2}|m{1,2}|s{1,3}|a)/;

  const tmpDate = new Date(0);

  const twoDigits = d => (d < 10 ? '0' : '')+d;

  const TOKENS = {
    D: ()=> ''+tmpDate.getDate(),
    DD: ()=> twoDigits(tmpDate.getDate()),
    s: ()=> ''+tmpDate.getSeconds(),
    ss: ()=> twoDigits(tmpDate.getSeconds()),
    MM: ()=> twoDigits(tmpDate.getMonth()+1),
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
    m: ()=> {
      return ''+tmpDate.getMinutes();
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

    parse: dateStr =>{
      const ts = Date.parse(dateStr);
      const utc = Date.parse(dateStr+'Z') || Date.parse(dateStr+'T00:00:00Z');
      if (ts !== utc)
        return new Date(ts);

      tmpDate.setTime(ts);

      return uDate.shiftToLocale(tmpDate);
    },

    shiftToLocale: dt => new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(),
                                  dt.getUTCHours(), dt.getUTCMinutes(), dt.getUTCSeconds(),
                                  dt.getUTCMilliseconds()),

    atUTCHour: (date, hour)=>{
      const orig = +date;
      const ans = new Date(orig);

      ans.setUTCHours(hour);

      if (orig > +ans)
        ans.setTime(DAY + +ans);

      return ans;
    },

    atUTCDowHour: (date, dow, hour)=>{
      const orig = +date;
      tmpDate.setTime(orig);

      tmpDate.setUTCHours(hour);
      const day = ((dow - tmpDate.getUTCDay() + 7) % 7);

      const ans = DAY*day + +tmpDate;

      return new Date( (orig > ans ? 7*DAY : 0) + ans);
    },

    toDiscrete: (date, mod)=>{
      const ans = new Date(date);
      switch(mod) {
      case DAY:
        ans.setHours(0);
      case HOUR:
        ans.setMinutes(0);
      case MIN:
        ans.setSeconds(0);
      case 1000:
        ans.setMilliseconds(0);
        return ans;
      default:
        throw new Error('unknown modulus');
      }
    },

    toDiscreteDay: (date)=>{
      tmpDate.setTime(date);
      return new Date(tmpDate.getFullYear(), tmpDate.getMonth(), tmpDate.getDate());
    },

    toSunday: (date)=>{
      const orig = +date;
      const ans = uDate.toDiscreteDay(orig);
      return new Date(+ans - ans.getDay()*DAY);
    },

    format: (d, format) => uDate.compileFormat(format)(d),

    relative: (delta)=>{
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
    compileFormat: (format)=>{
      const parts = format.split(SPLITTER);
      const len = parts.length;
      for(let i = 0; i < len; ++i) {
        const p = parts[i];
        const token = TOKENS[p];
        if (token !== undefined) parts[i] = token;
        else if (p[0] === '[') {
          parts[i] = p.slice(1,-1);
        }
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

define((require)=>{
  'use strict';
  const MIN = 60*1000;
  const HOUR = MIN*60;
  const DAY = 24*HOUR;
  const AVG_YEAR = 365.25*DAY;
  const AVG_MONTH = AVG_YEAR/12;

  const LANGS = {};

  const origLang = isClient ?  navigator.language : (()=>{
    const LANG = process.env.LC_ALL || process.env.LC_TIME;
    return LANG
      ? LANG.replace(/[.:].*$/, '').replace(/_/, '-')
      : Intl.DateTimeFormat().resolvedOptions().locale;
  })();
  let defaultLang = origLang;

  let currentLang;
  const shortMonthName = (month)=>{
    const months = LANGS[currentLang];
    if (months !== void 0) return months[month];

    // build month names for language
    const df = Intl.DateTimeFormat(currentLang || void 0, {month: 'short'});
    const date = new Date(2010, 0, 1);
    const list = [];
    for(let i = 0; i < 12; ++i) {
      date.setMonth(i);
      list.push(df.format(date));
    }
    LANGS[currentLang] = list;
    return list[month];
  };

  let relTimeLang = null, relTimeFormat;

  const polyfillReltime = Intl.RelativeTimeFormat && ! isTest ? void 0 : {
    format: (delta, unit)=>{
      if (delta == 0) return 'this '+unit;
      if (delta != 1 && delta != -1)
        unit = unit+'s';
      return delta < 0
        ? `${-delta} ${unit} ago` : `in ${delta} ${unit}`;
    }
  };

  const getRelativeTimeFormat = Intl.RelativeTimeFormat
        ? ((lang)=> relTimeLang === lang
           ? relTimeFormat
           : ((relTimeLang = lang), relTimeFormat = new Intl.RelativeTimeFormat(lang, {
             numeric: "auto", style: "long"
           })))
        : (() => polyfillReltime);

  const SPLITTER = /(\[.+?\]|D{1,2}|M{2,3}|Y{2,4}|h{1,2}|m{1,2}|s{1,3}|a)/;

  const tmpDate = new Date(0);

  const twoDigits = d => (d < 10 ? '0' : '')+d;

  const TOKENS = {
    D: ()=> ''+tmpDate.getDate(),
    DD: ()=> twoDigits(tmpDate.getDate()),
    s: ()=> ''+tmpDate.getSeconds(),
    ss: ()=> twoDigits(tmpDate.getSeconds()),
    MM: ()=> twoDigits(tmpDate.getMonth()+1),
    MMM: ()=> ''+shortMonthName(tmpDate.getMonth()),
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
    A: ()=> tmpDate.getHours() < 12 ? 'AM' : 'PM',
  };

  const compileStringFormat = (format, lang='')=>{
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

    return date =>{
      currentLang = lang;
      tmpDate.setTime(+date);
      let ans = '';
      for(let i = 0; i < len; ++i) {
        const part = parts[i];
        ans+= typeof part === 'string' ? part : part();
      }
      return ans;
    };
  };

  const compileIntlFormat = (format, lang)=>{
    const intl = Intl.DateTimeFormat(lang, format);
    return date => intl.format(date);
  };

  const uDate = {
    SEC: 1000,
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

    shiftToLocale: date => new Date(
      date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
      date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(),
      date.getUTCMilliseconds()),

    shiftToUTC: date => new Date(Date.UTC(
      date.getFullYear(), date.getMonth(), date.getDate(),
      date.getHours(), date.getMinutes(), date.getSeconds(),
      date.getMilliseconds())),

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

    toDiscrete: (date, unit)=>{
      const ans = new Date(date);
      switch(unit) {
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
        throw new Error('unknown unit');
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

    format: (date, format, lang=defaultLang) => uDate.compileFormat(format, lang)(date),

    relative: (delta, minTime=60000, lang=defaultLang)=>{
      const rt = getRelativeTimeFormat(lang);
      const abs = delta < 0 ? -delta : delta;
      if (minTime < 60000 && abs < 60000) return rt.format(Math.round(delta/1000), "second");

      if (minTime < 60*MIN && abs < 60*MIN) return rt.format(Math.round(delta/MIN), "minute");

      if (minTime < 24*HOUR && abs < 24*HOUR) return rt.format(Math.round(delta/HOUR), "hour");

      if (minTime < 30*DAY && abs < 30*DAY) return rt.format(Math.round(delta/DAY), "day");

      if (minTime < 540*DAY && abs < 540*DAY) return rt.format(Math.round(delta/AVG_MONTH), "month");

      return rt.format(Math.round(delta/AVG_YEAR), "year");

    },

    get defaultLang() {return defaultLang},
    set defaultLang(v=origLang) {
      if (defaultLang !== v) {
        defaultLang = v;
        relTimeFormat = relTimeLang = void 0;
      }
    },

    compileFormat: (format, lang=defaultLang)=> typeof format === 'string'
      ? compileStringFormat(format, lang) : compileIntlFormat(format, lang),
  };

  if (isTest) uDate[isTest] = {
    polyfillReltime,
    reset: ()=>{
      defaultLang = origLang;
      relTimeFormat = relTimeLang = void 0;
    },
  };

  return uDate;
});

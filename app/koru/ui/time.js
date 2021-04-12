define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const util            = require('koru/util');
  const uDate           = require('koru/util-date');

  const dateOpts = {year: 'numeric', month: 'short', day: 'numeric'};
  const timeOpts = {timeStyle: 'short'};
  let dtf, tf, tz;
  let lang;

  const fromNow = date => uDate.relative(+date - util.dateNow());

  const reset = ()=>{
    lang = uDate.defaultLang;
    dtf = Intl.DateTimeFormat(lang, dateOpts);
    tf = Intl.DateTimeFormat(lang, timeOpts);
  };

  const relTime = time =>{
    if (lang !== uDate.defaultLang) reset();
    time = +time;
    const now = util.dateNow();
    const result = dtf.format(time)+" "+tf.format(time);
    if (Math.abs(now - time) < 24*60*60*1000)
      return result + "; " + fromNow(time);
    else
      return result;
  };

  let dynTimes = null, stopDynTimer = null;

  const dynTimer = ()=>{
    for(let i = 0; i < dynTimes.length; ++i) {
      const time = dynTimes[i];
      Dom.ctx(time).updateElement(time);
    }

    stopDynTimer = koru.afTimeout(dynTimer, 60000);
  };

  const Time = {
    relTime,
    fromNow,
    startDynTime: ()=>{
      dynTimes = document.getElementsByClassName('dynTime');
      dynTimer();
    },
    stopDynTime: ()=>{
      if (dynTimes === null)
        return;
      stopDynTimer();
      dynTimes = stopDynTimer = null;
    },

    get TZ() {
      if (tz === void 0) {
        if (lang !== uDate.defaultLang) reset();
        tz = dtf.resolvedOptions().timeZone;
      }
      return tz;
    },

    set TZ(v) {
      tz = void 0;
      dateOpts.timeZone = timeOpts.timeZone = v;
      reset();
    },
  };

  Dom.registerHelpers({
    relTime: Time.relTime,
    fromNow,
  });

  return Time;
});

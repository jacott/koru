define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const util            = require('koru/util');
  const uDate           = require('koru/util-date');

  const dateOpts = {year: 'numeric', month: 'short', day: 'numeric'};
  const timeOpts = {timeStyle: 'short'};
  let dtf = Intl.DateTimeFormat(void 0, dateOpts), tf = Intl.DateTimeFormat(void 0, timeOpts);

  let tz;

  const fromNow = date => uDate.relative(+date - util.dateNow());

  const relTime = time =>{
    time = +time;
    const now = util.dateNow();
    const result = dtf.format(time)+" "+tf.format(time);
    if (Math.abs(now - time) < 24*60*60*1000)
      return result + "; " + fromNow(time);
    else
      return result;
  };

  let dynTimes = null, dynTimerId = 0;

  const dynTimer = ()=>{
    for(let i = 0; i < dynTimes.length; ++i) {
      const time = dynTimes[i];
      Dom.ctx(time).updateElement(time);
    }

    dynTimerId = koru.setTimeout(dynTimer, 60000);
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
      dynTimes = null;
      koru.clearTimeout(dynTimerId);
    },

    getTZ: ()=>{
      if (tz === void 0) {
        tz = dtf.resolvedOptions().timeZone;
      }
      return tz;
    },

    setTZ: (v)=>{
      tz = void 0;
      dateOpts.timeZone = timeOpts.timeZone = v;
      dtf = Intl.DateTimeFormat(uDate.defaultLang, dateOpts);
      tf = Intl.DateTimeFormat(uDate.defaultLang, timeOpts);
    },
  };

  Dom.registerHelpers({
    relTime: Time.relTime,
    fromNow,
  });

  return Time;
});

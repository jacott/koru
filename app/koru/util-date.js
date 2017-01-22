define(function(require, exports, module) {
  var util = require('koru/util');

  var DAY = 24*60*60*1000;

  return {
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
  };
});

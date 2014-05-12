define(function(require, exports, module) {
  var util = require('./util-base');
  var stacktrace = require('./stacktrace');

  return util.extend(util, {
    extractError: function (ex) {
      var st = stacktrace(ex);
      return ex.toString() + "\n" + (st ? st.join("\n") : util.inspect(ex));
    },
    stacktrace: stacktrace,

    colorToArray: colorToArray,
  });
});


function colorToArray(color) {
  if (typeof color !== 'string') return color;
  var result = [];
  var m = /^\s*#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?\s*$/.exec(color);
  if (m) {
    for(var i = 1; i < 4; ++i) {
      result.push(parseInt('0x'+m[i]));
    }
    result.push(m[4] ? Math.round(parseInt('0x'+m[i])*100/256)/100 : 1);
    return result;
  }
  m = /^\s*rgba?\s*\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\s*\)\s*$/.exec(color);
  if (m) {
    for(var i = 1; i < 4; ++i) {
      result.push(parseInt(m[i]));
    }
    result.push(m[4] ? parseFloat(m[i]) : 1);
    return result;
  }
  m = /^\s*#([\da-f])([\da-f])([\da-f])\s*$/.exec(color);
  if (m) {
    for(var i = 1; i < 4; ++i) {
      result.push(parseInt('0x'+m[i]+m[i]));
    }
    result.push(1);
    return result;
  }
}

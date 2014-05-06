/**
 * Mostly stolen from https://raw.github.com/occ/TraceKit
 * MIT license
 */

define(function () {
  var ANON_FUNCTION = 'anonymous',
      SERVER = typeof global === 'object' && global.hasOwnProperty('process');

  var chrome = /^\s*at ([^\(]+)\(((?:file|http|https):.+):(\d+):(\d+)\)\s*$/i,
      gecko = /^\s*(\S*|\[.+\])(?:\((.*?)\))?@((?:file|http|https):.+):(\d+)(?::(\d+))?\s*$/i,
      node = /^\s*at /;

  return function(ex) {
    if (!ex.stack) return;

    var lines = ex.stack.split('\n'),
        stack = [],
        parts, m,
        notUs = ex.name === 'AssertionError',
        url, func, line, column;

    if (SERVER) {
      for(var i=0;i < lines.length;++i) {
        line = lines[i];
        if (! node.test(line)) continue;

        if (/\/(geddon|testacular\.js|meteor-jasmine.js)/.test(line)) {
          if (notUs) continue;

        } else notUs = true;
        stack.push(line);
      }

      return stack;
    }

    for (var i = 0, j = lines.length; i < j; ++i) {
      if ((parts = chrome.exec(lines[i]))) {
        url = parts[2];
        func = (parts[1] || ANON_FUNCTION).trim();
        if (m = /\.testCase\.(.*)/.exec(func)) {
          func = "Test: " + m[1];
        }
        line = parts[3];
        column = parts[4];

      } else if ((parts = gecko.exec(lines[i]))) {
        url = parts[3];
        func = parts[1] || ANON_FUNCTION;
        line = parts[4];
        column = parts[5];
      } else {
        continue;
      }

      if (/\/(geddon|testacular\.js|karma.js)/.test(url)) {
        if (notUs) continue;

      } else notUs = true;

      func = (func || '').replace(/['"\[\]\(\)\{\}\s]+/g, ' ');

      line = "    at " + func + " ("+ url + ":" + line;
      column && (line += ":" + column);

      stack.push(line + ")");
    }

    return stack;
  };
});

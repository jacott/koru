/**
 * Originally stolen from https://raw.github.com/occ/TraceKit
 * MIT license
 */

define(['require', 'koru/util-base'], function (require, util) {
  var originRe, repl = '';
  var ANON_FUNCTION = 'anonymous';

  var node = /^\s*at (?:([^\(]+)?\()?(.*):(\d+):(\d+)\)?\s*$/i;
  var chrome = /^\s*at (?:([^\(]+)\()?((?:file|http|https):.+):(\d+):(\d+)\)?\s*$/i;
  var gecko = /^\s*(\S*|\[.+\])(?:\((.*?)\))?@((?:file|http|https):.+):(\d+)(?::(\d+))?\s*$/i;

  return function(ex) {
    if (!ex.stack) return;

    var lines = ex.stack.split('\n'),
        stack = [],
        parts, m,
        notUs = ex.name === 'AssertionError',
        url, func, line, column;

    if (originRe === undefined) {
      if (isServer) {
        originRe = new RegExp(require('./env').appDir+'/');
      } else {
        repl = '';
        var lcn = window.location;
        originRe = new RegExp('^'+util.regexEscape(lcn.protocol+'//'+lcn.host+'/'));
      }
    }

    for (var i = 0; i < lines.length; ++i) {
      if ((parts = (isServer ? node : chrome).exec(lines[i]))) {
        url = parts[2];
        func = (parts[1] || ANON_FUNCTION).trim();
        if (m = /\.testCase\.(.*)/.exec(func)) {
          func = "Test: " + m[1].replace(/\[[^]*\]/, '');
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
      };

      url = url.replace(originRe, repl);

      if (/(?:(?:koru\/test\/|require.js)|node_modules\/)/.test(url)) {
        if (notUs) continue;

      } else notUs = true;

      func = (func || '').replace(/['"\[\]\(\)\{\}\s]+/g, ' ');

      // put a dash after at for the first line to help emacs identify it as significant
      line = "    at " + (stack.length ? "" : "- ") + func + " ("+ url + ":" + line;
      column && (line += ":" + column);

      stack.push(line + ")");
    }

    return stack;
  };
});

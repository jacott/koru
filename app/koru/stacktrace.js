define(['require', 'koru/util-base'], function (require, util) {
  var originRe;
  var ANON_FUNCTION = 'anonymous';

  var node = /^\s*at (?:(.+)? \()?(.*):(\d+):(\d+)\)?\s*$/i;
  var chrome = /^\s*at (?:(.+) \()?((?:file|http|https):\/\/.+):(\d+):(\d+)\)?\s*$/i;
  var geckoSafari =  /^(?:(.*)@)?((?:file|http|https):\/\/.+):(\d+):(\d+)$/i;

  return function(ex) {
    if (!ex.stack) return;

    var lines = ex.stack.split('\n'),
        stack = [],
        parts, m,
        notUs = ex.name === 'AssertionError',
        url, func, line, column;

    if (originRe === undefined) {
      if (isServer) {
        originRe = new RegExp(require('./main').appDir+'/');
      } else {
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

      } else if ((parts = geckoSafari.exec(lines[i]))) {
        url = parts[2];
        func = (parts[1] || ANON_FUNCTION).replace(/\/</, '').replace(/[\[\]]/g, '');
        line = parts[3];
        column = parts[4];

      } else {
        continue;
      };

      url = url.replace(originRe, '');

      if (! util.FULL_STACK) {
        if (/(?:^|\/)(?:koru\/test\/|yaajs|node_modules\/|\.build\/)/.test(url) && ! /-test.js$/.test(url)) {
          if (/koru\/test\/client.js$/.test(url))
            break;
          if (notUs) continue;
        } else if (url === 'index.js') {
          if (stack.length)
            continue;
        } else
          notUs = true;
      }

      func = (func || '').replace(/['"\[\]\(\)\{\}\s]+/g, ' ');

      // put a dash after at for the first line to help emacs identify it as significant
      line = "    at " + (stack.length ? "" : "- ") + func + " ("+ url + ":" + line;
      column && (line += ":" + column);

      stack.push(line + ")");
    }

    return stack;
  };
});

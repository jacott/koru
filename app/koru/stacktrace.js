define(['require', 'koru/util-base'], (require, util)=>{
  const ANON_FUNCTION = 'anonymous';

  const node = /^\s*at (?:(.+)? \()?(.*):(\d+):(\d+)\)?\s*$/i;
  const chrome = /^\s*at (?:(.+) \()?((?:file|http|https):\/\/.+):(\d+):(\d+)\)?\s*$/i;
  const geckoSafari =  /^(?:(.*)@)?((?:file|http|https):\/\/.+):(\d+):(\d+)$/i;

  let originRe = null;

  return ex =>{
    if (! ex.stack) return;

    const lines = ex.stack.split('\n'),
          stack = [];

    let parts = null, m = null,
        notUs = ex.name === 'AssertionError',
        url = '', func = '', line = '', column = '';

    if (originRe === null) {
      if (isServer) {
        originRe = new RegExp(require('./main').appDir+'/');
      } else {
        const lcn = window.location;
        originRe = new RegExp('^'+util.regexEscape(lcn.protocol+'//'+lcn.host+'/'));
      }
    }

    for (let i = 0; i < lines.length; ++ i) {
      const row = lines[i];
      if ((parts = (isServer ? node : chrome).exec(row)) !== null) {
        func = (parts[1] || ANON_FUNCTION).trim();
        url = parts[2];
        if (m = /\.testCase\.(.*)/.exec(func)) {
          func = "Test: " + m[1].replace(/\[[^]*\]/, '');
        }
        line = parts[3];
        column = parts[4];

      } else if ((parts = geckoSafari.exec(row)) !== null) {
        func = (parts[1] || ANON_FUNCTION).replace(/\/</, '').replace(/[\[\]]/g, '');
        url = parts[2];
        line = parts[3];
        column = parts[4];

      } else {
        continue;
      };

      url = url.replace(originRe, '');

      if (util.FULL_STACK !== true) {
        if (/(?:^|\/)(?:koru\/test\/|yaajs|node_modules\/|\.build\/)/.test(url) &&
            ! /-test.js$/.test(url)) {
          if (/koru\/test\/(?:client|test-case).js$/.test(url)) {
            if (notUs) break;
            continue;
          }
          if (notUs) continue;
        } else if (url === 'index.js') {
          if (stack.length != 0)
            continue;
        } else
          notUs = true;
      }

      func = func.replace(/['"\[\]\(\)\{\}\s]+/g, ' ');

      // put a dash after at for the first line to help emacs identify it as significant
      line = "    at " + (stack.length ? "" : "- ") + func + " ("+ url + ":" + line;
      column && (line += ":" + column);

      stack.push(line + ")");
    }

    return stack;
  };
});

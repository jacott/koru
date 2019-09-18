define(['require', 'koru/util-base'], (require, util)=>{
  'use strict';
  const ANON_FUNCTION = 'anonymous';

  const elideFrames$ = Symbol(), normalizedStack$ = Symbol(), replacementError$ = Symbol();

  const node = /^\s*at (?:(.+)? \()?(.*):(\d+):(\d+)\)?\s*$/i;
  const chrome = /^\s*at (?:(.+) \()?((?:file|http|https):\/\/.+):(\d+):(\d+)\)?\s*$/i;
  const geckoSafari =  /^(?:(.*)@)?((?:file|http|https):\/\/.+):(\d+):(\d+)$/i;

  let originRe = null;

  const stackHasMessage = isServer || new Error("abc").stack.slice(7, 10) === "abc";

  const normalizedStack = (ex, elidePoint=0)=>{
    const stackString = stackHasMessage ? ex.stack.slice(ex.toString().length) : ex.stack;
    if (typeof stackString !== 'string') return null;

    const lines = stackString.split('\n'),
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
        if (func === ex.name) continue;
        url = parts[2];
        line = parts[3];
        column = parts[4];

      } else {
        continue;
      };

      url = url.replace(originRe, '');

      if (util.FULL_STACK !== true) {
        if (--elidePoint >= 0) continue;
        if (/(?:^|\/)(?:koru\/test\/|yaajs|node_modules\/|\.build\/)/.test(url) &&
            ! /-test\.js$/.test(url)) {
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
      line = "    at " + func + " ("+ url + ":" + line;
      column && (line += ":" + column);

      stack.push(line + ")");
    }

    return stack;
  };

  const normalize = (error)=>{
    if (error[normalizedStack$] !== void 0)
      return error[normalizedStack$];

    return (error[normalizedStack$] =
            error[replacementError$] !== void 0
            ? normalize(error[replacementError$])
            : normalizedStack(error, error[elideFrames$]));
  };

  return {
    elideFrames: (error, count)=>{
      error[elideFrames$] = count;
    },
    replaceStack: (error, replacementError)=>{
      error[replacementError$] = replacementError;
    },
    normalize,
  };
});

define(function(require, exports, module) {
  const koru           = require('koru');
  const htmlDoc        = require('koru/dom/html-doc');
  const util           = require('koru/util');


  const NEST_RE = {};
  const PAIR = {};
  '[] {} ()'.split(' ').forEach(pair => {
    PAIR[pair[0]] = pair[1];
    NEST_RE[pair[0]] = new RegExp(`[^/[\`"'{(\\${pair[1]}]*.`, 'g');
  });

  const SKIP_EOL = /[^\n]*/g;
  const SKIP_MLC = /[\s\S]*\*\//g;

  const STRING = {};
  ['`', '"', "'"].forEach(q => {
    STRING[q] = new RegExp(`[^\\\\${q}]*.`, 'g');
  });

  function extractCallSignature(func) {
    let code = func.toString();

    let m = /^(?:class[^{]*\{[^{]*(?=\bconstructor\b)|function\s*(?=\w))/.exec(code);

    if (m)
      code = code.slice(m[0].length);
    else if (m = /^(\w+)\s*=>/.exec(code))
      return m[1] += ' => {/*...*/}';

    if (code.startsWith('class'))
      return "constructor()";

    m = /^[^(]*\(/.exec(code);

    let pos = m ? findMatch(code, m[0].length, '(') : -1;

    if (pos === -1)
      throw new Error("Can't find signature of "+code);

    return code.slice(0, pos);
  }

  function findMatch(code, idx, lookFor) {
    const endChar = PAIR[lookFor];
    let m, re = NEST_RE[lookFor];
    re.lastIndex = idx;


    while (m = re.exec(code)) {
      let pos, found = code.charAt(re.lastIndex-1);

      switch (found) {
      case endChar:
        return re.lastIndex;
      case '`': case "'": case '"':
        pos = findStringEnd(code, re.lastIndex, found);
        break;
      case '/':
        switch (code.charAt(re.lastIndex)) {
        case '/':
          SKIP_EOL.lastIndex = re.lastIndex;
          if (! SKIP_EOL.exec(code))
            return -1;
          re.lastIndex = SKIP_EOL.lastIndex;
          continue;
        case '*':
          SKIP_MLC.lastIndex = re.lastIndex;
          if (! SKIP_MLC.exec(code))
            return -1;
          re.lastIndex = SKIP_MLC.lastIndex;
          continue;
        }
        return -1;
      default:
        pos = findMatch(code, re.lastIndex, found);
      }
      if (pos === -1) return -1;

      re.lastIndex=pos;
    }
  }


  function findStringEnd(code, idx, lookFor) {
    let m, re = STRING[lookFor];
    re.lastIndex = idx;

    while (m = re.exec(code)) {
      let pos, found = code.charAt(re.lastIndex-1);
      if (found === lookFor)
        return re.lastIndex;

      re.lastIndex++;
    }

    return -1;
  }

  module.exports = util.merge({
    extractCallSignature,
    findMatch,
  }, require('koru/env!./js-parser'));;
});

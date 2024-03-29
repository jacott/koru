define((require) => {
  'use strict';
  const koru            = require('koru');
  const util            = require('koru/util');

  const nestRe = (c) => new RegExp(`[/[\`"'{(\\${c}]`, 'g');
  const NEST_RE = {};
  const PAIR = {};
  '[] {} ()'.split(' ').forEach((pair) => {
    PAIR[pair[0]] = pair[1];
    NEST_RE[pair[0]] = nestRe(pair[1]);
  });

  const SKIP_EOL = /[^\n]*/g;
  const SKIP_MLC = /[\s\S]*\*\//g;

  const STRING = {};
  ['"', "'"].forEach((q) => {
    STRING[q] = new RegExp(`[\\\\${q}\\n]`, 'g');
  });

  const extractCallSignature = (func, name=func.name ?? '') => {
    let code = func.toString();

    if (typeof func === 'function' && /\[native code\]\s*\}$/.test(code)) {
      return `${name}(${new Array(func.length).fill('arg').map((n, i) => n + i).join(', ')})`;
    }

    let m = /^(?:class[^{]*\{[^{]*(?=\bconstructor\b)|function[\s\r\n]*(?=\w)?)/.exec(code);

    if (m != null) {
      code = code.slice(m[0].length);
    } else if (m = /^(\w+)\s*?=>/.exec(code)) {
      return `${name}(${m[1]})`;
    }

    // look for super class
    if (typeof func === 'function' && /^class\s/.test(code)) {
      if (/^class\s+\S+\s+extends\b/.test(code)) {
        try {
          return extractCallSignature(Object.getPrototypeOf(func), name);
        } catch (ex) {}
      }
      name = 'new ' + name;
    }

    if (code.startsWith('constructor(')) {
      if (name === '') name = '[Anonymous]';
      name = 'new ' + name;
    }

    const argListPos = code.indexOf('(');

    let pos = argListPos == -1 ? -1 : JsParser.findMatch(code, '(', argListPos);

    if (pos === -1) {
      if (name !== '') return name + '()';
      throw new Error("Can't find signature of " + code);
    }

    if (name === '') {
      if (code.endsWith(') { [native code] }')) {
        return code.slice(0, -18);
      }

      return code.slice(0, pos);
    }

    const argList = code.slice(argListPos, pos);
    const prefix = code.slice(0, argListPos);

    const namePos = prefix.indexOf(name);
    if (namePos !== -1) return prefix + argList;

    if (typeof func === 'function') {
    }
    return name + argList;
  };

  const shiftIndent = (code) => {
    let out = '', prev = 0;
    let shift = -1;
    const cb = (level, idx) => {
      const line = code.slice(prev, idx);
      prev = idx;
      if (line.trim() === '') {
        out += line;
        return;
      }
      const ws = /^ */.exec(line)[0];
      if (shift == -1) {
        shift = ws.length;
      }
      if (ws.length < shift) {
        shift = ws.length;
      }
      out += line.slice(shift);
    };
    lineNestLevel(code, cb);

    cb(0);
    return out;
  };

  const indent = (code, width=2) => {
    const spacer = '            '.slice(0, width);
    let out = '', prev = 0;
    let cl = 0, tab = '';
    const stack = [];
    const cb = (level, idx) => {
      if (cl > level) {
        level = cl = stack.pop();

        tab = tab.slice(0, -width);
      }
      const line = code.slice(prev, idx).replace(/^[ \t\r]+/, '');
      if (line === '\n') {
        out += line;
      } else {
        out += tab + line;
      }

      if (cl != level) {
        stack.push(cl);
        cl = level;
        tab += spacer;
      }
      prev = idx;
    };
    lineNestLevel(code, cb);

    cb(0);
    return out;
  };

  const lineNestLevel = (code, callback, idx=0) => {
    let indentLevel = 0;
    const findMatch = (code, lookFor, idx) => {
      ++indentLevel;
      const re = /[\]\[`"'}{)(\n]/g;
      re.lastIndex = idx;
      let m;
      const endChar = PAIR[lookFor] || lookFor;

      while (m = re.exec(code)) {
        const idx = re.lastIndex;
        let pos, found = code.charAt(idx - 1);

        switch (found) {
        case endChar:
          --indentLevel;
          return idx;
        case '`':
          pos = findTemplateEnd(code, idx, findMatch);
          break;
        case "'": case '"':
          pos = findStringEnd(code, idx, found);
          break;
        case '/':
          switch (code.charAt(idx)) {
          case '/':
            SKIP_EOL.lastIndex = idx;
            if (! SKIP_EOL.exec(code)) {
              return -1;
            }
            re.lastIndex = SKIP_EOL.lastIndex;
            continue;
          case '*':
            SKIP_MLC.lastIndex = idx;
            if (! SKIP_MLC.exec(code)) {
              return -1;
            }
            re.lastIndex = SKIP_MLC.lastIndex;
            continue;
          }
          return -1;
        case '\n':
          callback(indentLevel - 1, idx);
          continue;
        default:
          pos = findMatch(code, found, idx);
        }
        if (pos === -1) return -1;

        re.lastIndex = pos;
      }
      return -1;
    };

    findMatch(code, undefined, idx);
  };

  const findMatch = (code, lookFor, idx) => {
    if (STRING[lookFor] !== undefined) {
      return findStringEnd(code, idx, lookFor);
    }

    const _endChar = PAIR[lookFor];
    if (_endChar === undefined && lookFor === '`') {
      return findTemplateEnd(code, idx, findMatch);
    }
    const re = _endChar === undefined ? nestRe(lookFor) : NEST_RE[lookFor];
    re.lastIndex = idx;
    let m;
    const endChar = _endChar === undefined ? lookFor : _endChar;

    while (m = re.exec(code)) {
      const idx = re.lastIndex;
      let pos, found = code.charAt(idx - 1);

      switch (found) {
      case endChar:
        return idx;
      case '`':
        pos = findTemplateEnd(code, idx, findMatch);
        break;
      case "'": case '"':
        pos = findStringEnd(code, idx, found);
        break;
      case '/':
        switch (code.charAt(idx)) {
        case '/':
          SKIP_EOL.lastIndex = idx;
          if (! SKIP_EOL.exec(code)) {
            return -1;
          }
          re.lastIndex = SKIP_EOL.lastIndex;
          continue;
        case '*':
          SKIP_MLC.lastIndex = idx;
          if (! SKIP_MLC.exec(code)) {
            return -1;
          }
          re.lastIndex = SKIP_MLC.lastIndex;
          continue;
        }
        return -1;
      default:
        pos = findMatch(code, found, idx);
      }
      if (pos === -1) return -1;

      re.lastIndex = pos;
    }
    return -1;
  };

  const findTemplateEnd = (code, idx, findMatch) => {
    const len = code.length;
    let m, re = /[\\$`]/g;
    re.lastIndex = idx;

    while (m = re.exec(code)) {
      const idx = re.lastIndex - 1;
      let found = code.charAt(idx);

      if (found === '`') return idx + 1;
      if (idx + 1 === len) return -1;

      if (found === '$' && code.charAt(idx + 1) === '{') {
        const pos = findMatch(code, '{', idx + 2);
        if (pos === -1) return pos;
        re.lastIndex = pos;
      } else {
        re.lastIndex++;
      }
    }

    return -1;
  };

  const findStringEnd = (code, idx, lookFor) => {
    let m, re = STRING[lookFor];
    re.lastIndex = idx;

    while (m = re.exec(code)) {
      let found = code.charAt(re.lastIndex - 1);
      if (found === lookFor) {
        return re.lastIndex;
      }

      if (found === '\n') {
        return -1;
      }

      re.lastIndex++;
    }

    return -1;
  };

  const JsParser = require('koru/env!./js-parser')({
    extractCallSignature,
    findMatch: (code, lookFor, idx=0) => {
      idx = code.indexOf(lookFor, idx);
      return idx == -1 ? -1 : findMatch(code, lookFor, idx + 1);
    },
    lineNestLevel,
    indent,
    shiftIndent,
  });

  return JsParser;
});

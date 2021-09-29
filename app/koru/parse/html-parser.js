define((require, exports, module) => {
  'use strict';

  const util            = require('koru/util');

  const WS = /\s/;

  const RAW_TAGS = {
    script: '</script>', style: '</style>', textarea: '</textarea>', title: '</title>',
  };

  const BLOCK_TAGS = {
    address: true, article: true, aside: true, blockquote: true,
    details: true, div: true, dl: true,
    fieldset: true, figcaption: true, figure: true, footer: true, form: true,
    h1: true, h2: true, h3: true, h4: true, h5: true, h6: true,
    header: true, hgroup: true, hr: true, main: true, menu: true, nav: true,
    ol: true, p: true, pre: true, section: true, table: true, ul: true,
  };

  const DD_DT = {dd: true, dt: true}, RP_RT = {rt: true, rp: true},
        TBODY_FOOT = {tbody: true, tfoot: true};
  const NO_NEST = {
    area: true, base: true, basefont: true, br: true,
    col: true, command: true, embed: true, frame: true,
    hr: true, img: true, input: true, isindex: true, keygen: true,
    link: true, meta: true, param: true, source: true, track: true, wbr: true,

    // CODITIONAL NO_NEST
    p: BLOCK_TAGS,
    dd: DD_DT, dt: DD_DT,
    rp: RP_RT, rt: RP_RT,
    option: {option: true, optgroup: true},
    tbody: TBODY_FOOT, tfoot: TBODY_FOOT,

    // NO_SELF_NEST
    li: {li: true}, optgroup: {optgroup: true}, tr: {tr: true}, th: {th: true}, td: {td: true},
  };

  const UEOI = 'Unexpected end of input';

  class HTMLParseError extends SyntaxError {
    constructor(message, filename, line, column) {
      super(message + "\n\tat " + filename + ':' + line + ':' + column);
      this.filename = filename;
      this.line = line;
      this.column = column;
    }
    get name() {return 'HTMLParseError'}
  }

  class _Error {
    constructor(msg, i) {
      this.msg = msg;
      this.i = i;
    }
  }

  const _error = (msg, i) => {throw new _Error(msg, i)};

  const S_GET_NAME = 0, S_PRE_ANAME = 1, S_POST_ANAME = 2, S_ANAME = 3,
        S_PRE_AVALUE = 4, S_AVALUE = 5, S_AVALUE_ALT = 6;

  const findEndTag = (memo, opts, endTag) => {
    const {code, pos} = memo, {length} = code;
    for (let i = pos; i != -1; ++i) {
      i = code.indexOf('</', i);
      if (i == -1 || i + endTag.length > length) break;
      const t = code.slice(i, i + endTag.length);
      if (t === endTag || t.toLowerCase() === endTag) {
        opts.ontext(code, pos, i);
        memo.pos = i + endTag.length;
        return;
      }
    }
    _error('Could not find ' + endTag, pos);
  };

  const parseOpenTag = (memo, opts) => {
    const {code, name, nn} = memo, {length} = code;
    const spos = memo.pos - 1;
    let state = S_GET_NAME, attrs = {};
    let an = '', char = '';
    let i = memo.pos, newName = '';
    for (;i<length; ++i) {
      char = code[i];
      if (state == S_GET_NAME) {
        if (char === '!') {
          if (length > i+3 && code.slice(i+1, i+3) === '--') {
            const eidx = code.indexOf('--', i+3);
            if (eidx == -1 || length < eidx+2) {
              _error('Missing end of comment', length);
            }
            if (code[eidx+2] !== '>') {
              _error("'--' not allow in comment", eidx);
            }
            opts.oncomment(code, memo.pos - 1, eidx+3);
            memo.pos = eidx+3;
            return false;
          }
        }
        if (char === '>' || WS.test(char)) {
          newName = code.slice(memo.pos, i);
          if (char === '>') {
            break;
          }
          state = S_PRE_ANAME;
        }
        continue;
      } else if (state == S_PRE_ANAME) {
        if (char === '>') break;
        if (char !== '/' && ! WS.test(char)) {
          state = S_ANAME;
          memo.pos = i;
        }
      } else if (state == S_ANAME) {
        if (WS.test(char)) {
          if (an === '') {
            an = code.slice(memo.pos, i);
          }
        } else if (char === '/') {
          attrs[code.slice(memo.pos, i)] = true;
          an = '';
          state = S_PRE_ANAME;
        } else if (an !== '' || char === '>' || char === '=') {
          if (an === '') {
            an = code.slice(memo.pos, i);
          } else if (char !== '=') {
            attrs[an] = true;
            an = '';
            if (char === '>') break;
            memo.pos = i;
          }
          if (char === '=') {
            state = S_PRE_AVALUE;
          } else if (char === '>') {
            attrs[an] = '';
            an = '';
            break;
          }
        }
      } else if (state == S_PRE_AVALUE) {
        if (char === '"') {
          state = S_AVALUE;
          memo.pos = i+1;
        } else if (char === "'") {
          state = S_AVALUE_ALT;
          memo.pos = i+1;
        } else if (! WS.test(char)) {
          _error(`Expected '"'`, i);
        }
      } else if (state == S_AVALUE) {
        if (char === '"') {
          attrs[an] = code.slice(memo.pos, i);
          an = '';
          state = S_PRE_ANAME;
        }
      } else if (state == S_AVALUE_ALT) {
        if (char === "'") {
          attrs[an] = code.slice(memo.pos, i);
          an = '';
          state = S_PRE_ANAME;
        }
      } else {
        break;
      }
    }
    if (i == length) _error(UEOI, i);

    memo.pos = i+1;
    const selfClose = code[i-1] === '/';
    if (selfClose && newName[memo.name.length - 1] === '/') {
      newName = newName.slice(0, -1);
    }

    const lcn = memo.name = newName.toLowerCase();
    const endTag = RAW_TAGS[lcn];
    if (endTag !== void 0) {
      opts.onopentag(newName, attrs, code, spos, i+1);
      findEndTag(memo, opts, endTag);
      opts.onclosetag(newName, 'end', code, memo.pos - endTag.length, memo.pos);
      return true;
    }
    const implClose = typeof nn === 'object' && nn[lcn] !== void 0;
    memo.nn = NO_NEST[lcn];
    if (implClose) {
      opts.onclosetag(name, 'missing', code, spos, i+1);
    }
    opts.onopentag(newName, attrs, code, spos, i+1);

    if (selfClose || memo.nn === true) {
      opts.onclosetag(newName, 'self', code, spos, i+1);
    } else {
      if (implClose) return false;
      parseBody(memo, opts);
    }
    return true;
  };

  const parseBody = (memo, opts) => {
    const {code} = memo, {length} = code;
    while (memo.pos < length) {
      const sidx = code.indexOf('<', memo.pos);
      if (sidx == -1) {
        opts.ontext(code, memo.pos, length);
        memo.pos = length;
        break;
      } else {
        if (sidx+3 > length) {
          _error(UEOI, length);
        }
        if (sidx != memo.pos) {
          opts.ontext(code, memo.pos, sidx);
        }
        memo.pos = sidx+1;
        if (code[memo.pos] === '/') {
          if (parseCloseTag(memo, opts)) {
            break;
          }
        } else {
          const {name, nn} = memo;
          if (parseOpenTag(memo, opts)) {
            memo.name = name;
            memo.nn = nn;
          }
        }
      }
    }
  };

  const parseCloseTag = (memo, opts) => {
    const {code} = memo, {length} = code;
    let char = '';
    const sidx = memo.pos + 1;
    const eidx = code.indexOf('>', sidx);
    if (eidx == -1) {
      _error(UEOI, length);
    }
    const name = code.slice(sidx, eidx);
    if (name === 'p' && memo.name !== 'p') {
      memo.pos = eidx+1;
      opts.onopentag(name, {}, code, sidx-2, eidx+1);
      opts.onclosetag(name, 'end', code, sidx-2, eidx+1);
      return false;
    }
    if (memo.name === '') {
      _error('Unexpected end tag', memo.pos - 1);
    }

    const missing = name !== memo.name && name.toLowerCase() !== memo.name;
    if (missing) {
      --memo.pos;
    } else {
      memo.pos = eidx+1;
    }

    opts.onclosetag(memo.name, missing ? 'missing' : 'end', code, sidx-2, eidx+1);
    return true;
  };

  const nop = () => {};

  const HTMLParser = {
    parse: (code, {
      filename='<anonymous>',
      onopentag=nop, ontext=nop, oncomment=nop, onclosetag=nop,
    }={}) => {
      try {
        parseBody({code, name: '', pos: 0, nn: void 0},
                  {onopentag, ontext, oncomment, onclosetag});
      } catch (err) {
        if (err.constructor !== _Error) throw err;
        const lc = util.indexTolineColumn(code, err.i);
        throw new HTMLParseError(err.msg, filename, lc[0], lc[1]);
      }
    },
    BLOCK_TAGS,
    HTMLParseError,
  };

  if (isTest) HTMLParser[isTest] = {NO_NEST, RAW_TAGS};

  return HTMLParser;
});

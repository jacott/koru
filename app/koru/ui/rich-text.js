define(function(require, exports, module) {
  const Dom    = require('koru/dom');
  const util   = require('koru/util');
  const uColor = require('koru/util-color');

  const ELEMENT_NODE = document.ELEMENT_NODE;
  const TEXT_NODE = document.TEXT_NODE;

  const OL = 1, UL = 2, NEST = 3, CODE = 4, LINK = 5,
        LEFT = 6, RIGHT = 7, CENTER = 8, JUSTIFY = 9,
        MULTILINE = 10, BOLD = 11, ITALIC = 12, UNDERLINE = 13,
        FONT = 14, BGCOLOR = 15, COLOR = 16, SIZE = 17,
        STRIKE = 18,
        LI = 20, H1 = 21;


  const FONT_FACE_TO_ID = {
    'sans-serif': 0,
    serif: 1,
    monospace: 2,
    cursive: 5,
    handwriting: 7,
    whiteboard: 8,
    poster: 9,
  };

  const FONT_ID_TO_FACE = [];
  for (const id in FONT_FACE_TO_ID)
    FONT_ID_TO_FACE[FONT_FACE_TO_ID[id]] = id;

  const FONT_ID_TO_STD = FONT_ID_TO_FACE.slice();

  const ALIGN_TEXT_TO_CODE = {
    left: LEFT,
    right: RIGHT,
    center: CENTER,
    justify: JUSTIFY
  };


  const ALIGN_CODE_TO_TEXT = [];
  for (const id in ALIGN_TEXT_TO_CODE)
    ALIGN_CODE_TO_TEXT[ALIGN_TEXT_TO_CODE[id]] = id;

  Object.assign(ALIGN_TEXT_TO_CODE, {
    start: LEFT,
    end: RIGHT,
    'justify-all': JUSTIFY
  });

  const LINK_TO_HTML = [{
    id: 0,
    class: "",
    fromHtml(node) {return node.getAttribute('href')},
    toHtml(node, ref) {
      if (! /[\/#]/.test(ref[0])) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener');
      }
        node.setAttribute('href', ref.replace(/^javascript:/,''));
      node.setAttribute('draggable', 'false');
    },
  }];

  const LINK_FROM_HTML = {
    '': LINK_TO_HTML[0]
  };

  const INLINE_TAGS = util.toMap('B U I S A SPAN CODE FONT EM STRONG KBD TT Q'.split(' '));

  const fromHtml = (html, options)=>{
    const builder = new MarkupBuilder(options);
    if (options && options.includeTop)
      (FROM_RULE[html.tagName] || fromDiv).call(builder, html);
    else
      builder.fromChildren(html);
    const markup = builder.markup;
    return [builder.lines, markup.length ? markup : null];
  };

  class MarkupBuilder {
    constructor () {
      this.markup = [];
      this.lines = [];
      this.inlines = [];
      this.inlineIdx = 0;
      this.needNL = true;
      this._relativePos = 0;
    }

    relative (pos) {
      const rel = pos - this._relativePos;
      this._relativePos = pos;
      return rel;
    }

    newLine () {
      this.resetInlines();
      this.needNL = false;
      this.lines.push('');
    }

    addInline (muIndex, code, index, value) {
      if (muIndex === this.markup.length) {
        this.markup.push(code, this.relative(index), this.lines[index].length, 0);
        value === undefined || this.markup.push(value);
        return;
      }
      const cc = this.markup[muIndex];
      let values = this.markup[muIndex+4];
      if (cc !== MULTILINE) {
        this.markup[muIndex] = MULTILINE;
        if (values === undefined)
          this.markup.push(values = [cc]);
        else
          this.markup[muIndex+4] = values = [cc, values];
      }
      values.push(code);
      if (value !== undefined) values.push(value);
    }

    resetInlines () {
      if (this.inlineIdx === 0) return;
      const lineLength = this.lines[this.lines.length - 1].length;
      for(let i = this.inlineIdx-1; i >= 0; --i) {
        const entry = this.inlines[i];
        const node = entry[0];
        const rule = FROM_RULE[node.tagName] || this.ignoreInline;
        entry[1] === null || rule.call(this, node, lineLength, entry[1]);
      }

      this.inlineIdx = 0;
    }

    applyInlines () {
      const index = this.lines.length - 1;
      let i;
      for(i = this.inlineIdx; i < this.inlines.length; ++i) {
        const entry = this.inlines[i];
        const node = entry[0];
        const rule = FROM_RULE[node.tagName] || this.ignoreInline;;
        const len = this.markup.length;
        rule.call(this, node, index);
        if (len === this.markup.length)
          entry[1] = null;
        else
          entry[1] = len;
      }
      this.inlineIdx = i;
    }

    ignoreInline () {}

    fromChildren(parent) {
      const endAlign =  (parent.nodeType === ELEMENT_NODE && ! isInlineNode(parent)
                         && (parent.getAttribute('align') || parent.style.textAlign))
            ? textAlign.call(this, parent) : undefined;

      const nodes = parent.childNodes;
      const last = nodes.length - 1;
      for(let index = 0; index <= last; ++index) {
        const node = nodes[index];

        if(node.tagName === 'BR') {
          if (this.needNL)
            this.newLine();
          else
            this.needNL = true;
          continue;
        }

        if (isInlineNode(node)) {
          if (node.nodeType === TEXT_NODE) {
            const text = node.textContent.replace(/[ \n\t\r]+/g, ' ');
            if (! text.replace(/(?:^[ \n\t]+|[ \n\t]+$)/g, '')) continue;
            this.needNL && this.newLine();
            this.applyInlines();
            this.lines[this.lines.length - 1] += text;
          } else {
            this.inlines.push([node, null]);
            this.fromChildren(node);
            const rule = FROM_RULE[node.tagName] || this.ignoreInline;
            const entry = this.inlines.pop();
            if (entry[1] !== null)
              rule.call(this, node, this.lines[this.lines.length - 1].length, entry[1]);
            this.inlineIdx = Math.min(this.inlineIdx, this.inlines.length);
          }
        } else {
          this.needNL = true;
          const rule = fromBlockRule(node);
          rule.call(this, node);
          this.needNL = true;
          this.resetInlines();
        }
      }

      endAlign && endAlign.call(this, parent);
    }
  };

  const isInlineNode = item => item.nodeType === TEXT_NODE || INLINE_TAGS[item.tagName];

  function textAlign(node) {
    const start = this.lines.length;
    const code = ALIGN_TEXT_TO_CODE[node.style.textAlign || node.getAttribute('align')];
    if (code === undefined) return;
    this.markup.push(code, this.relative(start), 0);
    const endMarker = this.markup.length - 1;

    return function () {
      this.markup[endMarker] = this.lines.length - 1 - start;
    };
  }

  function fromDiv(node) {
    this.fromChildren(node);
  }

  function fromLi(node) {
    const start = this.lines.length;
    this.markup.push(LI, this.relative(start), 0);
    const endMarker = this.markup.length - 1;

    this.fromChildren(node, {});

    this.markup[endMarker] = this.lines.length - 1 - start;
  };

  const fromInline = code => function fromInline(node, index, pos) {
    if (pos === undefined)
      this.markup.push(code, this.relative(index), this.lines[index].length, 0);
    else
      this.markup[pos+3] = index;
  };

  const fromBlock = code => function fromBlock(node) {
    const start = this.lines.length;
    this.markup.push(code, this.relative(start), 0);
    const endMarker = this.markup.length - 1;
    this.fromChildren(node);
    this.markup[endMarker] = this.lines.length - 1 - start;
  };

  function fromPre(parent) {
    const builder =this;
    let needNl = true;
    const {lines} = builder;
    const start = lines.length;
    builder.markup.push(CODE, builder.relative(start), 0);
    const pos = builder.markup.length - 1;
    builder.newLine();
    lines[start] = "code:"+(parent.getAttribute('data-lang')||'text');

    const nodes = parent.childNodes;
    const last = nodes.length - 1;
    let hlCode, prevLen = 0;

    const addText = text =>{
      const cIdx = lines.length - 1;
      const lPos = lines[cIdx].length;
      lines[cIdx] += text;
      if (hlCode !== undefined && lines[cIdx].length !== lPos) {
        builder.markup.push(hlCode, builder.relative(cIdx), lPos - prevLen, lines[cIdx].length - lPos);
        hlCode = undefined;
        prevLen = lines[cIdx].length;

      }
    };

    const extractText = node =>{
      if (node.tagName === 'SPAN') {
        hlCode = CLASS_TO_CODE[node.className];
      }
      if (node.nodeType === TEXT_NODE) {
        lines.length || lines.push('');
        if (needNl) {
          prevLen = 0;
          builder.newLine();
          needNl = false;
        }
        const rows = node.textContent.split("\n");
        addText(rows[0]);
        for(let i = 1; i < rows.length; ++i) {
          needNl = false;
          prevLen = 0;
          builder.newLine();
          addText(rows[i]);
        }
      } else if (node.tagName === 'BR') {
        prevLen = 0;
        builder.newLine();
      } else {
        if (! INLINE_TAGS[node.tagName])
          needNl = true;
        const nodes = node.childNodes;
        for(let i = 0; i < nodes.length; ++i) {
          extractText(nodes[i]);
        }
        if (! INLINE_TAGS[node.tagName])
          needNl = true;
      }
    };


    for(let index = 0; index <= last; ++index) {
      extractText(nodes[index]);
    }
    builder.markup[pos] = builder.lines.length - start - 1;
  }

  const CODE_TO_CLASS = [
    'hll',// { background-color: #ffffcc }
    'c',  // { color: #408080; font-style: italic } /* Comment */
    'err',// { border: 1px solid #FF0000 } /* Error */
    'k',  // { color: #008000; font-weight: bold } /* Keyword */
    'o',  // { color: #666666 } /* Operator */
    'cm', // { color: #408080; font-style: italic } /* Comment.Multiline */
    'cp', // { color: #BC7A00 } /* Comment.Preproc */
    'c1', // { color: #408080; font-style: italic } /* Comment.Single */
    'cs', // { color: #408080; font-style: italic } /* Comment.Special */
    'gd', // { color: #A00000 } /* Generic.Deleted */
    'ge', // { font-style: italic } /* Generic.Emph */
    'gr', // { color: #FF0000 } /* Generic.Error */
    'gh', // { color: #000080; font-weight: bold } /* Generic.Heading */
    'gi', // { color: #00A000 } /* Generic.Inserted */
    'go', // { color: #808080 } /* Generic.Output */
    'gp', // { color: #000080; font-weight: bold } /* Generic.Prompt */
    'gs', // { font-weight: bold } /* Generic.Strong */
    'gu', // { color: #800080; font-weight: bold } /* Generic.Subheading */
    'gt', // { color: #0040D0 } /* Generic.Traceback */
    'kc', // { color: #008000; font-weight: bold } /* Keyword.Constant */
    'kd', // { color: #008000; font-weight: bold } /* Keyword.Declaration */
    'kn', // { color: #008000; font-weight: bold } /* Keyword.Namespace */
    'kp', // { color: #008000 } /* Keyword.Pseudo */
    'kr', // { color: #008000; font-weight: bold } /* Keyword.Reserved */
    'kt', // { color: #B00040 } /* Keyword.Type */
    'm',  // { color: #666666 } /* Literal.Number */
    's',  // { color: #BA2121 } /* Literal.String */
    'na', // { color: #7D9029 } /* Name.Attribute */
    'nb', // { color: #008000 } /* Name.Builtin */
    'nc', // { color: #0000FF; font-weight: bold } /* Name.Class */
    'no', // { color: #880000 } /* Name.Constant */
    'nd', // { color: #AA22FF } /* Name.Decorator */
    'ni', // { color: #999999; font-weight: bold } /* Name.Entity */
    'ne', // { color: #D2413A; font-weight: bold } /* Name.Exception */
    'nf', // { color: #0000FF } /* Name.Function */
    'nl', // { color: #A0A000 } /* Name.Label */
    'nn', // { color: #0000FF; font-weight: bold } /* Name.Namespace */
    'nt', // { color: #008000; font-weight: bold } /* Name.Tag */
    'nv', // { color: #19177C } /* Name.Variable */
    'ow', // { color: #AA22FF; font-weight: bold } /* Operator.Word */
    'w',  // { color: #bbbbbb } /* Text.Whitespace */
    'mf', // { color: #666666 } /* Literal.Number.Float */
    'mh', // { color: #666666 } /* Literal.Number.Hex */
    'mi', // { color: #666666 } /* Literal.Number.Integer */
    'mo', // { color: #666666 } /* Literal.Number.Oct */
    'sb', // { color: #BA2121 } /* Literal.String.Backtick */
    'sc', // { color: #BA2121 } /* Literal.String.Char */
    'sd', // { color: #BA2121; font-style: italic } /* Literal.String.Doc */
    's2', // { color: #BA2121 } /* Literal.String.Double */
    'se', // { color: #BB6622; font-weight: bold } /* Literal.String.Escape */
    'sh', // { color: #BA2121 } /* Literal.String.Heredoc */
    'si', // { color: #BB6688; font-weight: bold } /* Literal.String.Interpol */
    'sx', // { color: #008000 } /* Literal.String.Other */
    'sr', // { color: #BB6688 } /* Literal.String.Regex */
    's1', // { color: #BA2121 } /* Literal.String.Single */
    'ss', // { color: #19177C } /* Literal.String.Symbol */
    'bp', // { color: #008000 } /* Name.Builtin.Pseudo */
    'vc', // { color: #19177C } /* Name.Variable.Class */
    'vg', // { color: #19177C } /* Name.Variable.Global */
    'vi', // { color: #19177C } /* Name.Variable.Instance */
    'il', // { color: #666666 } /* Literal.Number.Integer.Long */
  ];

  const CLASS_TO_CODE = {};

  CODE_TO_CLASS.forEach(function (id, index) {
    CLASS_TO_CODE[id] = index;
  });

  function fromFont(node, index, pos) {
    if (pos !== undefined) {
      this.markup[pos+3] = index;
      return;
    }

    const markupLen = this.markup.length;
    if (node.tagName === 'FONT') {
      const face = node.getAttribute('face');
      face && fromFace.call(this, markupLen, FONT, 'font-family', face, index);
      const color = uColor.toHex(node.getAttribute('color'));
      color && fromColor.call(this, markupLen, COLOR, 'color', color, index);
      const size = node.getAttribute('size');
      size && fromSize.call(this, markupLen, SIZE, 'size', size, index);
    } else {
      fromFace.call(this, markupLen, FONT, 'font-family', 'monospace', index);
    }
  }

  const SPAN_STYLES = {
    'background-color': [BGCOLOR, fromColor],
    'color': [COLOR, fromColor],
    'font-family': [FONT, fromFace],
    'font-size': [SIZE, fromSize],
    'font-weight': [BOLD, fromSimple, /bold/i],
    'font-style': [ITALIC, fromSimple, /italic/i],
    'text-decoration': [null, fromTextDecoration],
    'text-decoration-line': [null, fromTextDecoration],
  };

  function fromColor(muIndex, code, name, value, index) {
    this.addInline(muIndex, code, index, uColor.toHex(value));
  }

  function fromFace(muIndex, code, name, value, index) {
    const id = FONT_FACE_TO_ID[value.replace(/'/g,'')];
    this.addInline(muIndex, code, index, id === undefined ? value : id);
  }

  const FONT_SIZE_TO_EM = {
    '1': '.68em',
    'x-small': '.68em',
    '2': '.8em',
    'small': '.8em',
    '3': '1em',
    'medium': '1em',
    '4': '1.2em',
    'large': '1.2em',
    '5': '1.6em',
    'x-large': '1.6em',
    '6': '2em',
    'xx-large': '2em',
    '7': '3em',
    'xxx-large': '3em',
  };

  function fromSize(muIndex, code, name, value, index) {
    const size = FONT_SIZE_TO_EM[value.replace(/^-[a-z]+-/,'')];
    if (! size && value.slice(-2) !== 'em')
      return;

    this.addInline(muIndex, code, index, size || value);
  }

  function fromTextDecoration(muIndex, code, name, value, index) {
    if (/underline/i.test(value))
      this.addInline(muIndex, UNDERLINE, index);
    if (/line-through/i.test(value))
      this.addInline(muIndex, STRIKE, index);
  }

  function fromSimple(muIndex, code, name, value, index, expect) {
    if (expect.test(value))
      this.addInline(muIndex, code, index);
  }

  function fromSpan(node, index, pos) {
    if (pos !== undefined) {
      this.markup[pos+3] = index;
      return;
    }

    const {style} = node;
    const markupLen = this.markup.length;
    for(let i = 0; i < style.length; ++i) {
      const name = style.item(i);
      const spanStyle = SPAN_STYLES[name];

      if (spanStyle) {
        spanStyle[1].call(this, markupLen, spanStyle[0], name, style[name], index, spanStyle[2]);
      }
    }
  }

  function fromIgnore() {}

  const FROM_RULE = {
    HEAD: fromIgnore,
    META: fromIgnore,
    TITLE: fromIgnore,
    STYLE: fromIgnore,
    SCRIPT: fromIgnore,
    DIV: fromDiv,
    OL: fromBlock(OL),
    UL: fromBlock(UL),
    LI: fromLi,
    BLOCKQUOTE: fromBlock(NEST),
    P: fromDiv,
    B: fromInline(BOLD),
    I: fromInline(ITALIC),
    U: fromInline(UNDERLINE),
    S: fromInline(STRIKE),
    SPAN: fromSpan,
    CODE: fromFont,
    FONT: fromFont,
    PRE: fromPre,

    A(node, index, pos) {
      const code = LINK_FROM_HTML[node.className] || LINK_TO_HTML[0];

      const {style} = node;

      if (pos === undefined) {
        if (this.hasATag) return;
        this.hasATag = true;
        this.markup.push(LINK, this.relative(index), this.lines[index].length, 0, code.id, 0);
        const markupLen = this.markup.length;
        for(let i = 0; i < style.length; ++i) {
          const name = style.item(i);
          const spanStyle = SPAN_STYLES[name];

          if (spanStyle) {
            spanStyle[1].call(this, markupLen, spanStyle[0], name, style[name], index, spanStyle[2]);
          }
        }
      } else {
        this.hasATag = null;
        let count = pos+5;
        this.markup[count] = index;
        const lineIdx = this.lines.length - 1;
        this.lines[lineIdx] += ' (' + code.fromHtml(node) + ')';
        this.markup[pos+3] = this.lines[lineIdx].length;
        for(let i = 0; i < style.length; ++i) {
          const name = style.item(i);
          const spanStyle = SPAN_STYLES[name];

          if (spanStyle) {
            this.markup[(count+=4)] = index;
          }
        }
      }
    },
  };

  for(let i = 0; i < 6; ++i) {
    FROM_RULE['H'+(i+1)] = fromBlock(H1+i);
  }

  function fromBlockRule(node) {
    return FROM_RULE[node.tagName] || fromDiv;
  }

  // TO HTML

  const toHtml = (lines, markup, result)=> new HtmlBuilder().toHtml(lines, markup, result);

  class HtmlBuilder {
    toHtml(lines, markup, html=document.createDocumentFragment()) {
      lines = typeof lines === 'string' ? lines.split("\n") : lines;
      this.markup = markup || [];
      this.lidx = this.midx = 0;
      this.lineCount = [this.offset(1)];
      let state = {result: html, rule: toDiv, begun: true};

      let nrule;
      this.line = null;
      for(let index = 0; index < lines.length; ++index) {
        this.line = lines[this.lidx = index];
        while (index === this.nextMarkupLine() && ((nrule = TO_RULES[this.offset(0)]) && ! nrule.inline)) {
          state = {result: state.result, rule: nrule, last: this.endMarkup(), oldState: state};
          state.rule.call(this, state);
        }
        state.inlineStart = 0;
        state.inlineEnd = this.line.length;
        state.rule.call(this, state);

        while (state.last === index) {
          state.endCall && state.endCall.call(this);

          state = state.oldState;
        }
      }

      return html;
    }

    offset(offset) {return this.markup[this.midx + offset]}

    nextRule (offset) {
      this.midx += offset;
      this.lineCount[this.midx] = this.lidx + this.markup[this.midx + 1];
    }

    nextMarkupLine () {return this.lineCount[this.midx]}

    endMarkup () {return this.lineCount[this.midx] + this.offset(2)}

    toChildren(state) {
      let nextMarkup = this.nextMarkupLine();
      let startPos = state.inlineStart;
      let endPos = state.inlineEnd;

      if (this.lidx === nextMarkup) {
        while(this.lidx ===  nextMarkup && this.offset(2) < endPos) {
          const rule = TO_RULES[this.offset(0)];
          const text = this.line.slice(state.inlineStart || 0, this.offset(2));

          if (text)
            state.result.appendChild(document.createTextNode(text));
          startPos = this.offset(3);

          state = {
            result: state.result,
            oldState: state,
            index: this.midx,
            rule: rule,
            inlineStart: this.offset(2),
            inlineEnd: this.offset(3),
          };
          this.nextRule(rule.muInc),

          state.rule.call(this, state);
          startPos = state.inlineEnd;
          state = state.oldState;
          state.inlineStart = startPos;

          nextMarkup = this.nextMarkupLine();
        }
      }

      if (! this.line) {
        state.result.appendChild(document.createElement('BR'));
      } else {
        const text = this.line.slice(startPos, endPos);

        text !== '' &&
          state.result.appendChild(document.createTextNode(text));
      }
      state.inlineEnd = endPos;
    }
  };

  const toBlock = tag =>{
    function block(state) {
      if (! state.begun) {
        this.nextRule(3);
        return state.begun = true;
      }
      const oldResult = state.result;
      oldResult.appendChild(state.result = document.createElement(tag));
      if (this.align)
        state.result.style.textAlign = this.align;
      this.toChildren(state);
      state.result = oldResult;
    };

    block.tag = tag;
    return block;
  };

  const toDiv = toBlock('DIV');

  const toNested = (blockTag, innerFunc)=> function (state) {
    state.begun = true;
    state.result.appendChild(state.result = document.createElement(blockTag));
    state.rule = innerFunc;
    this.nextRule(3);
  };

  function innerH(state) {
    const oldResult = state.result;
    if (this.align)
      state.result.style.textAlign = this.align;
    this.toChildren(state);
    state.result = oldResult;
  }

  const toHeading = blockTag => function (state) {
    state.begun = true;
    state.result.appendChild(state.result = document.createElement(blockTag));
    state.rule = innerH;
    this.nextRule(3);
  };

  function toLi(state) {
    state.begun = true;
    state.result.appendChild(state.result = document.createElement('LI'));
    state.rule = toInnerLi;
    this.nextRule(3);
  }

  function toInnerLi(state) {
    const oldResult = state.result;
    if (state.result.firstChild || this.align) {
      oldResult.appendChild(state.result = document.createElement('DIV'));
      if (this.align)
        state.result.style.textAlign = this.align;
    }
    this.toChildren(state);
    state.result = oldResult;
  }

  function toAlign(state) {
    if (! state.begun) {
      state.rule = state.oldState.rule;
      const oldAlign = this.align;
      this.align = ALIGN_CODE_TO_TEXT[this.offset(0)];
      this.nextRule(3);
      state.endCall = function () {
        this.align = oldAlign;
      };
      return state.begun = true;
    }
  }

  function toCode(state) {
    if (! state.begun) {
      const pre = document.createElement('PRE');
      const inner = document.createElement('DIV');
      if (state.oldState.rule.tag === 'LI') {
        const li = document.createElement('LI');
        if (this.align)
          li.style.textAlign = this.align;
        li.appendChild(pre);
        state.result.appendChild(li);
      } else
        state.result.appendChild(pre);
      pre.appendChild(state.result = inner);
      state.currLine = this.lidx;
      state.lastLine = state.currLine + this.offset(2);
      this.nextRule(3);
      state.skip = true;
      pre.setAttribute('data-lang', this.line.slice(5));
      state.rulePos = this.midx;
      const markup = this.markup;
      state.offset = delta => markup[state.rulePos + delta];

      while (state.lastLine >= (this.lidx = this.nextMarkupLine())) {
        this.nextRule(4);
      }

      return state.begun = true;
    }


    if (state.skip) {
      state.skip = false;
      return;
    }

    const {line} = this;

    let startPos = 0;

    let delta = state.offset(1);
    while(this.lidx === (state.currLine + delta)) {
      const eIdx = startPos + state.offset(2);
      if (eIdx > startPos)
        state.result.appendChild(document.createTextNode(line.slice(startPos, eIdx)));

      const span = document.createElement('SPAN');
      span.className = CODE_TO_CLASS[state.offset(0)];
      span.textContent = line.slice(eIdx, startPos = eIdx + state.offset(3));

      state.result.appendChild(span);
      state.currLine += delta;
      state.rulePos+=4;
      delta = state.offset(1);
    }
    let text = line.slice(startPos);

    if (this.lidx !== state.lastLine)
      text += "\n";
    if (text )
      state.result.appendChild(document.createTextNode(text));
    else if (! state.result.firstChild)
      state.result.appendChild(document.createElement('BR'));
  }

  const CODE_TO_STYLE_NAME = [], CODE_TO_STYLE_VALUE = [];
  CODE_TO_STYLE_NAME[BOLD] = 'font-weight'; CODE_TO_STYLE_VALUE[BOLD] = 'bold';
  CODE_TO_STYLE_NAME[ITALIC] = 'font-style'; CODE_TO_STYLE_VALUE[ITALIC] = 'italic';
  CODE_TO_STYLE_NAME[UNDERLINE] = 'text-decoration'; CODE_TO_STYLE_VALUE[UNDERLINE] = 'underline';
  CODE_TO_STYLE_NAME[STRIKE] = 'text-decoration'; CODE_TO_STYLE_VALUE[STRIKE] = 'line-through';
  CODE_TO_STYLE_NAME[BGCOLOR] = 'background-color';
  CODE_TO_STYLE_NAME[COLOR] = 'color';
  CODE_TO_STYLE_NAME[FONT] = 'font-family';
  CODE_TO_STYLE_VALUE[FONT] = function (value) {
    return FONT_ID_TO_FACE[value] || value;
  };
  CODE_TO_STYLE_NAME[SIZE] = 'font-size';

  function toInline(state) {
    const oldResult = state.result;
    oldResult.appendChild(state.result = document.createElement('SPAN'));
    const code = this.markup[state.index];
    state.result.style[CODE_TO_STYLE_NAME[code]] = CODE_TO_STYLE_VALUE[code];
    this.toChildren(state);
    state.result = oldResult;
  } toInline.inline = true; toInline.muInc = 4;

  function toInlineValue(state) {
    const oldResult = state.result;
    oldResult.appendChild(state.result = document.createElement('SPAN'));
    const code = this.markup[state.index];
    const value = this.markup[state.index+4];
    const decode = CODE_TO_STYLE_VALUE[code];
    state.result.style.setProperty(
      CODE_TO_STYLE_NAME[code], decode === undefined ? value : decode(value));
    this.toChildren(state);
    state.result = oldResult;
  } toInlineValue.inline = true; toInlineValue.muInc = 5;

  function toMultiInline(state) {
    const oldResult = state.result;
    oldResult.appendChild(state.result = document.createElement('SPAN'));
    const value = this.markup[state.index+4];
    const {style} = state.result;
    for(let idx = 0; idx < value.length; ++idx) {
      const code = value[idx];
      const decode = CODE_TO_STYLE_VALUE[code];
      const sn = CODE_TO_STYLE_NAME[code];
      const sv = typeof decode === 'string' ? decode
            : decode === undefined ? value[++idx] : decode(value[++idx]);
      const ov = style.getPropertyValue(sn);
      style.setProperty(sn, ov ? ov + ' ' + sv : sv);
    }
    this.toChildren(state);
    state.result = oldResult;
  } toMultiInline.inline = true; toMultiInline.muInc = 5;

  function toFont(state) {
    const oldResult = state.result;
    oldResult.appendChild(state.result = document.createElement('FONT'));
    const code = this.offset(-1);
    if (! Array.isArray(code))
      code = [code];
    util.forEach(code, attr =>{
      if (typeof attr === 'string') {
        switch(attr[0]) {
        case '#': case 'r':
          state.result.setAttribute('color', attr);
          return;
        default:
          if (/^[1-7]$/.test(attr)) {
            state.result.setAttribute('size', attr);
            return;
          }
          break;
        }
      }
      state.result.setAttribute('face', FONT_ID_TO_FACE[attr] || attr);
    });
    this.toChildren(state);
    state.result = oldResult;
  } toFont.inline = true; toFont.muInc = 5;

  function toBgColor(state) {
    const oldResult = state.result;
    oldResult.appendChild(state.result = document.createElement('SPAN'));
    const code = this.offset(-1);
    state.result.style.backgroundColor = code;
    this.toChildren(state);
    state.result = oldResult;
  } toBgColor.inline = true; toBgColor.muInc = 5;

  function toLink(state) {
    const oldResult = state.result;
    const link = state.result = document.createElement('A');
    oldResult.appendChild(link);
    const code = LINK_TO_HTML[this.offset(-2)];
    code.class && (link.className = code.class);
    const lineEnd = state.inlineEnd;
    state.inlineEnd = this.offset(-1);
    const ref = this.line.slice(state.inlineEnd + 2, lineEnd - 1);
    this.toChildren(state);
    state.inlineEnd = lineEnd;
    const tnode = state.result.lastChild;
    code.toHtml(state.result, ref);
    state.result = oldResult;
  } toLink.inline = true; toLink.muInc = 6;

  const TO_RULES = [];
  TO_RULES[0] = toDiv;
  TO_RULES[OL] = toNested('OL', toDiv);
  TO_RULES[UL] = toNested('UL', toDiv);
  TO_RULES[LI] = toLi,
  TO_RULES[NEST] = toNested('BLOCKQUOTE', toDiv);
  TO_RULES[CODE] = toCode;

  TO_RULES[LINK] = toLink;

  TO_RULES[LEFT] = toAlign;
  TO_RULES[RIGHT] = toAlign;
  TO_RULES[CENTER] = toAlign;
  TO_RULES[JUSTIFY] = toAlign;

  TO_RULES[MULTILINE] = toMultiInline;
  TO_RULES[BOLD] = toInline;
  TO_RULES[ITALIC] = toInline;
  TO_RULES[UNDERLINE] = toInline;
  TO_RULES[STRIKE] = toInline;
  TO_RULES[FONT] = toInlineValue;
  TO_RULES[BGCOLOR] = toInlineValue;
  TO_RULES[COLOR] = toInlineValue;
  TO_RULES[SIZE] = toInlineValue;

  for(let i = 0; i < 6; ++i) {
    const code = H1+i;
    TO_RULES[H1+i] = toHeading('H'+(i+1));
  }

  return {
    standardFonts: FONT_ID_TO_STD,
    fontIdToFace: FONT_ID_TO_FACE,

    toHtml,

    fromHtml(html, options) {
      const rt = fromHtml(html, options);
      rt[0] = rt[0].join("\n");
      return rt;
    },

    fromToHtml(html) {
      const rt = fromHtml(Dom.h({div: html}));
      return toHtml(rt[0], rt[1], document.createElement('div'));
    },

    isValid(text, markup) {
      if (text == null && markup == null) return true;
      if (typeof text !== 'string' || ! (markup == null || Array.isArray(markup)))
        return false;

      const html = toHtml(text, markup, document.createElement('div'));
      const rt = fromHtml(html);

      return text === rt[0].join('\n') && util.deepEqual(rt[1], markup);
    },

    linkType: id => LINK_TO_HTML[id],

    registerLinkType(data) {
      LINK_TO_HTML[data.id] = data;
      LINK_FROM_HTML[data.class] = data;
    },
    deregisterLinkType(id) {
      const data = LINK_TO_HTML[id];
      if (data !== undefined) {
        delete LINK_TO_HTML[id];
        delete LINK_FROM_HTML[data.class];
      }
    },

    fontType(face) {
      const idn = +face;
      if (idn !== idn) {
        if (! face) return 'sans-serif';
        face = face.replace(/['"]/g,'');
        const id = FONT_FACE_TO_ID[face];
        return id === undefined ? face : FONT_ID_TO_STD[+id];
      }
      return FONT_ID_TO_STD[idn];
    },

    mapFontNames(faces) {
      for(const std in faces) {
        const code = FONT_FACE_TO_ID[std];
        if (code === undefined) throw new Error("face not found: " + std);
        const face = faces[std];
        FONT_FACE_TO_ID[face] = code;
        FONT_ID_TO_FACE[code] = face;
        if (face.indexOf(" ") !== -1) {
          const f2 = face.replace(/ /g, '\\ ');
          FONT_FACE_TO_ID[f2] = code;
        }
      }
    },

    FONT_SIZE_TO_EM,

    INLINE_TAGS,
  };
});

define(function(require, exports, module) {
  require('koru/dom/html-doc');
  var Dom = require('koru/dom/base');
  var util = require('koru/util');
  var uColor = require('koru/util-color');

  var TEXT_NODE = document.TEXT_NODE;

  var OL = 1, NEST = 2, BOLD = 3, ITALIC = 4, UL = 5, LINK = 6, UNDERLINE = 7, CODE = 8, FONT = 9, BGCOLOR = 10, ALIGN = 11;

  var FONT_FACE_TO_ID = {
    'sans-serif': 0,
    serif: 1,
    monospace: 2,
    cursive: 5,
    handwriting: 7,
    whiteboard: 8,
    poster: 9,
  };

  var FONT_ID_TO_FACE = [];
  for (var id in FONT_FACE_TO_ID)
    FONT_ID_TO_FACE[FONT_FACE_TO_ID[id]] = id;

  var ALIGN_TEXT_TO_CODE = {
    left: 0,
    right: 1,
    center: 2,
    justify: 3
  };


  var ALIGN_CODE_TO_TEXT = [];
  for (var id in ALIGN_TEXT_TO_CODE)
    ALIGN_CODE_TO_TEXT[ALIGN_TEXT_TO_CODE[id]] = id;

  var LINK_TO_HTML = [
    {
      id: 0,
      class: "",
      fromHtml: function (node) {return node.getAttribute('href')},
      toHtml: function (node, ref) {
        node.setAttribute('target', '_blank');
        node.setAttribute('href', ref.replace(/^javascript:/,''));
      },
    },
  ];

  var LINK_FROM_HTML = {
    '': LINK_TO_HTML[0]
  };

  var INLINE_TAGS = util.toMap('B U I A SPAN CODE FONT EM STRONG KBD TT Q'.split(' '));

  function fromHtml(html, options) {
    var builder = new MarkupBuilder(options);
    var state = {rule: fromDiv};
    if (options && options.includeTop)
      fromDiv.call(builder, html, state);
    else
      builder.fromChildren(html, state);
    var markup = builder.markup;
    return [builder.lines, markup.length ? markup : null];
  }

  function MarkupBuilder() {
    this.markup = [];
    this.lines = [];
    this.inlines = [];
    this.inlineIdx = 0;
    this.needNL = true;
    this._relativePos = 0;
  }

  MarkupBuilder.prototype = {
    constructor: MarkupBuilder,

    relative: function (pos) {
      var rel = pos - this._relativePos;
      this._relativePos = pos;
      return rel;
    },

    newLine: function () {
      this.resetInlines();
      this.needNL = false;
      this.lines.push('');
    },

    resetInlines: function () {
      if (this.inlineIdx === 0) return;
      var lineLength = this.lines[this.lines.length - 1].length;
      for(var i = this.inlineIdx-1; i >= 0; --i) {
        var entry = this.inlines[i];
        var node = entry[0];
        var rule = FROM_RULE[node.tagName] || this.ignoreInline;
        rule.call(this, node, lineLength, entry[1]);
      }

      this.inlineIdx = 0;
    },

    applyInlines: function () {
      var index = this.lines.length - 1;
      for(var i = this.inlineIdx; i < this.inlines.length; ++i) {
        var entry = this.inlines[i];
        var node = entry[0];
        var rule = FROM_RULE[node.tagName] || this.ignoreInline;;
        if (rule.call(this, node, index) === false)
          entry[1] = null;
        else
          entry[1] = this.markup.length - 1;
      }
      this.inlineIdx = i;
    },

    ignoreInline: function () {},

    fromChildren: function(parent, state) {
      if (parent.style.textAlign)
        textAlign.call(this, parent, state);

      var nodes = parent.childNodes;
      var last = state.last = nodes.length - 1;
      for(var index = 0; index <= last; ++index) {
        var node = nodes[index];
        if(node.tagName === 'BR') {
          if (this.needNL)
            this.newLine();
          else
            this.needNL = true;
          continue;
        }

        if (isInlineNode(node)) {
          if (node.nodeType === TEXT_NODE) {
            if (! node.textContent) continue;
            this.needNL && this.newLine();
            this.applyInlines();
            this.lines[this.lines.length - 1] += node.textContent;
          } else {
            this.inlines.push([node, null]);
            this.fromChildren(node, state);
            var rule = FROM_RULE[node.tagName] || this.ignoreInline;
            var entry = this.inlines.pop();
            if (entry[1] !== null)
              rule.call(this, node, this.lines[this.lines.length - 1].length, entry[1]);
            this.inlineIdx = Math.min(this.inlineIdx, this.inlines.length);
          }
        } else {
          this.needNL = true;
          state.rule.call(this, node, state);
          this.needNL = true;
          this.resetInlines();
        }
      }

      state.endCall && state.endCall.call(this, parent, state);
    },
  };

  function textAlign(node, state) {
    var start = this.lines.length;
    this.markup.push(ALIGN, this.relative(start), 0, ALIGN_TEXT_TO_CODE[node.style.textAlign]);
    var endMarker = this.markup.length - 2;
    var lastEndCall = state.endCall;

    state.endCall = function () {
      state.endCall = lastEndCall;
      this.markup[endMarker] = this.lines.length - 1 - start;
    };
  }

  function fromDiv(node, state) {
    var rule = fromBlockRule(node);
    if (rule && rule.override)
      return rule.call(this, node, state);

    this.fromChildren(node, rule === fromDiv ? state : {rule: rule});
  }

  function fromInline(code) {
    return function fromInline(node, index, pos) {
      if (pos === undefined)
        this.markup.push(code, this.relative(index), this.lines[index].length, 0);
      else
        this.markup[pos] = index;
    };
  }

  function fromBlock(code) {
    return function fromBlock(node, state) {
      if (state.start === undefined) {
        state.start = this.lines.length;
        this.markup.push(code, this.relative(state.start), 0);
        state.endMarker = this.markup.length - 1;
      }
      var rule = fromBlockRule(node);
      this.fromChildren(node, rule === fromDiv ? state : {rule: rule});

      this.markup[state.endMarker] = this.lines.length - 1 - state.start;
    };
  }

  function fromPre(parent, state) {
    var needNl = true;
    var builder =this;
    var lines = builder.lines;
    var start = lines.length;
    builder.markup.push(CODE, builder.relative(start), 0);
    var pos = builder.markup.length - 1;
    builder.newLine();
    lines[start] = "code:"+(parent.getAttribute('data-lang')||'text');

    var nodes = parent.childNodes;
    var last = state.last = nodes.length - 1;
    var hlCode;
    var prevLen = 0;
    for(var index = 0; index <= last; ++index) {
      extractText(nodes[index]);
    }
    builder.markup[pos] = builder.lines.length - start - 1;

    function addText(text) {
      var cIdx = lines.length - 1;
      var lPos = lines[cIdx].length;
      lines[cIdx] += text;
      if (hlCode !== undefined && lines[cIdx].length !== lPos) {
        builder.markup.push(hlCode, builder.relative(cIdx), lPos - prevLen, lines[cIdx].length - lPos);
        hlCode = undefined;
        prevLen = lines[cIdx].length;

      }
    }

    function extractText(node) {

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
        var rows = node.textContent.split("\n");
        addText(rows[0]);
        for(var i = 1; i < rows.length; ++i) {
          needNl = false;
          prevLen = 0;
          builder.newLine();
          addText(rows[i]);
        }
      } else if (node.tagName === 'BR') {
        prevLen = 0;
        builder.newLine();
        needNl = false;
      } else {
        if (! INLINE_TAGS[node.tagName])
          needNl = true;
        var nodes = node.childNodes;
        for(var i = 0; i < nodes.length; ++i) {
          extractText(nodes[i], lines, state);
        }
        if (! INLINE_TAGS[node.tagName])
          needNl = true;
      }
    }
  } fromPre.override = true;

  var CODE_TO_CLASS = [
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

  var CLASS_TO_CODE = {};

  CODE_TO_CLASS.forEach(function (id, index) {
    CLASS_TO_CODE[id] = index;
  });

  function fromFont(node, index, pos) {
    if (pos !== undefined) {
      this.markup[pos - 1] = index;
      return;
    }

    var attrs = [];
    if (node.tagName === 'FONT') {
      var face = node.getAttribute('face');
      var color = uColor.toHex(node.getAttribute('color'));
      color && attrs.push(color);
      var size = node.getAttribute('size');
      size && attrs.push(size);
    } else {
      var face = 'monospace';
    }
    var faceId = FONT_FACE_TO_ID[face];
    if (faceId === undefined)
      faceId = face;
    faceId == null || attrs.push(faceId);

    if (! attrs.length)
      return false;
    this.markup.push(FONT, this.relative(index), this.lines[index].length, 0, attrs.length === 1 ? attrs[0] : attrs);
  }

  function fromSpan(node, index, pos) {
    if (pos !== undefined) {
      this.markup[pos - 1] = index;
      return;
    }

    var attrs = [];
    var style = node.style;
    if (! style.backgroundColor) return false;
    this.markup.push(BGCOLOR, this.relative(index), this.lines[index].length, 0, uColor.toHex(style.backgroundColor));
  }

  var FROM_RULE = {
    DIV: fromDiv,
    OL: fromBlock(OL),
    UL: fromBlock(UL),
    BLOCKQUOTE: fromBlock(NEST),
    P: fromDiv,
    B: fromInline(BOLD),
    U: fromInline(UNDERLINE),
    I: fromInline(ITALIC),
    SPAN: fromSpan,
    CODE: fromFont,
    FONT: fromFont,
    PRE: fromPre,

    A: function (node, index, pos) {
      var code = LINK_FROM_HTML[node.className] || LINK_TO_HTML[0];
      if (pos === undefined)
        this.markup.push(LINK, this.relative(index), this.lines[index].length, 0, code.id, 0);
      else {
        this.markup[pos] = index;
        var lineIdx = this.lines.length - 1;
        this.lines[lineIdx] += ' (' + code.fromHtml(node) + ')';
        this.markup[pos - 2] = this.lines[lineIdx].length;
      }
    },
  };

  function fromBlockRule(node) {
    return FROM_RULE[node.tagName] || fromDiv;
  }

  // TO HTML

  function toHtml(lines, markup, result) {
    return new HtmlBuilder(lines, markup, result);
  }

  function HtmlBuilder(lines, markup, html) {
    html = html || document.createDocumentFragment();
    lines = typeof lines === 'string' ? lines.split("\n") : lines;
    this.markup = markup || [];
    this.lidx = this.midx = 0;
    this.lineCount = [this.offset(1)];
    var state = {result: html, rule: toDiv, begun: true};

    var nrule;
    for(var index = 0; index < lines.length; ++index) {
      this.line = lines[this.lidx = index];
      while (index === this.nextMarkupLine() && ((nrule = TO_RULES[this.offset(0)]) && ! nrule.inline)) {
        state = {result: state.result, rule: nrule, last: this.endMarkup(), oldState: state};
        state.rule.call(this, state);
      }
      state.inlineStart = 0;
      state.inlineEnd = this.line.length;
      state.rule.call(this, state);

      while (state.last === index) {
        state = state.oldState;
      }
    }

    return html;
  }

  HtmlBuilder.prototype = {
    constructor: HtmlBuilder.constructor,

    offset: function(offset) {
      return this.markup[this.midx + offset];
    },

    nextRule: function (offset) {
      this.midx += offset;
      this.lineCount[this.midx] = this.lidx + this.markup[this.midx + 1];
    },

    nextMarkupLine: function () {
      return this.lineCount[this.midx];
    },

    endMarkup: function () {
      var line = this.lineCount[this.midx] + this.offset(2);
      return line;
    },

    toChildren: function(state) {
      var nextMarkup = this.nextMarkupLine();
      var startPos = state.inlineStart;
      var endPos = state.inlineEnd;

      if (this.lidx === nextMarkup) {
        while(this.lidx ===  nextMarkup && this.offset(2) < endPos) {
          var rule = TO_RULES[this.offset(0)];

          var text = this.line.slice(state.inlineStart || 0, this.offset(2));

          if (text)
            state.result.appendChild(document.createTextNode(text));
          startPos = this.offset(3);

          state = {
            result: state.result,
            oldState: state,
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
        var text = this.line.slice(startPos, endPos);

        text &&
          state.result.appendChild(document.createTextNode(text));
      }
      state.inlineEnd = endPos;
    },
  };

  var toLi = toBlock('LI');
  var toDiv = toBlock('DIV');

  function toNested(blockTag, innerFunc) {
    return function toNested(state) {
      state.begun = true;
      state.result.appendChild(state.result = document.createElement(blockTag));
      state.rule = innerFunc;
      this.nextRule(3);
    };
  }

  function toAlign(state) {
    if (! state.begun) {
      var tag = state.oldState.rule;
      state.tag = (tag && tag.tag) || 'DIV';
      state.type = ALIGN_CODE_TO_TEXT[this.offset(3)];
      this.nextRule(4);
      return state.begun = true;
    }
    var oldResult = state.result;

    oldResult.appendChild(state.result = document.createElement(state.tag));

    state.result.style.textAlign = state.type;
    this.toChildren(state);
    state.result = oldResult;
  }

  function toBlock(tag) {
    block.tag = tag;
    return block;
    function block(state) {
      if (! state.begun) {
        this.nextRule(3);
        return state.begun = true;
      }
      var oldResult = state.result;
      oldResult.appendChild(state.result = document.createElement(tag));
      this.toChildren(state);
      state.result = oldResult;
    };
  }

  function toCode(state) {
    if (! state.begun) {
      var pre = document.createElement('pre');
      var inner = document.createElement('div');
      state.result.appendChild(pre);
      pre.appendChild(state.result = inner);
      state.currLine = this.lidx;
      state.lastLine = state.currLine + this.offset(2);
      this.nextRule(3);
      state.skip = true;
      pre.setAttribute('data-lang', this.line.slice(5));
      state.rulePos = this.midx;
      var markup = this.markup;
      state.offset = function (delta) {
        return markup[state.rulePos + delta];
      };

      while (state.lastLine >= (this.lidx = this.nextMarkupLine())) {
        this.nextRule(4);
      }

      return state.begun = true;
    }


    if (state.skip) {
      state.skip = false;
      return;
    }

    var line = this.line;

    var startPos = 0;

    var delta = state.offset(1);
    while(this.lidx === (state.currLine + delta)) {
      var eIdx = startPos + state.offset(2);
      if (eIdx > startPos)
        state.result.appendChild(document.createTextNode(line.slice(startPos, eIdx)));

      var span = document.createElement('SPAN');
      span.className = CODE_TO_CLASS[state.offset(0)];
      span.textContent = line.slice(eIdx, startPos = eIdx + state.offset(3));

      state.result.appendChild(span);
      state.currLine += delta;
      state.rulePos+=4;
      delta = state.offset(1);
    }
    var text = line.slice(startPos);
    if (this.lidx !== state.lastLine)
      text += "\n";
    text && state.result.appendChild(document.createTextNode(text));
  }

  function toInline(tag, attrs) {
    function toInlineTag(state) {
      var oldResult = state.result;
      oldResult.appendChild(state.result = document.createElement(tag));
      attrs && addAttrs(attrs, state.result);
      this.toChildren(state);
      state.result = oldResult;
    } toInlineTag.inline = true; toInlineTag.muInc = 4;

    return toInlineTag;
  };

  function addAttrs(attrs, elm) {
    for(var name in attrs)
      elm.setAttribute(name, attrs[name]);
  }

  function toFont(state) {
    var oldResult = state.result;
    oldResult.appendChild(state.result = document.createElement('FONT'));
    var code = this.offset(-1);
    if (! Array.isArray(code))
      code = [code];
    util.forEach(code, function (attr) {
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
    var oldResult = state.result;
    oldResult.appendChild(state.result = document.createElement('SPAN'));
    var code = this.offset(-1);
    state.result.style.backgroundColor = code;
    this.toChildren(state);
    state.result = oldResult;
  } toBgColor.inline = true; toBgColor.muInc = 5;

  function toLink(state) {
    var oldResult = state.result;
    var link = state.result = document.createElement('A');
    oldResult.appendChild(link);
    var code = LINK_TO_HTML[this.offset(-2)];
    code.class && (link.className = code.class);
    var lineEnd = state.inlineEnd;
    state.inlineEnd = this.offset(-1);
    var ref = this.line.slice(state.inlineEnd + 2, lineEnd - 1);
    this.toChildren(state);
    state.inlineEnd = lineEnd;
    var tnode = state.result.lastChild;
    code.toHtml(state.result, ref);
    state.result = oldResult;
  } toLink.inline = true; toLink.muInc = 6;

  var TO_RULES = [];
  TO_RULES[0] = toDiv;
  TO_RULES[OL] = toNested('OL', toLi);
  TO_RULES[UL] = toNested('UL', toLi);
  TO_RULES[NEST] = toNested('BLOCKQUOTE', toDiv);
  TO_RULES[CODE] = toCode;

  TO_RULES[BOLD] = toInline('B');
  TO_RULES[ITALIC] = toInline('I');
  TO_RULES[UNDERLINE] = toInline('U');
  TO_RULES[FONT] = toFont;
  TO_RULES[BGCOLOR] = toBgColor;
  TO_RULES[LINK] = toLink;
  TO_RULES[ALIGN] = toAlign;

  function isInlineNode(item) {
    return item.nodeType === TEXT_NODE || INLINE_TAGS[item.tagName];
  }

  return {
    standardFonts: FONT_ID_TO_FACE,

    toHtml: toHtml,

    fromHtml: fromHtml,

    fromToHtml: function (html) {
      var rt = fromHtml(Dom.h({div: html}));
      return toHtml(rt[0], rt[1], document.createElement('div'));
    },

    isValid: function (text, markup) {
      if (text == null && markup == null) return true;
      if (typeof text !== 'string' || ! (markup == null || Array.isArray(markup)))
        return false;

      var html = toHtml(text, markup, document.createElement('div'));
      var rt = fromHtml(html);

      return text === rt[0].join('\n') && util.deepEqual(rt[1], markup);
    },

    linkType: function (id) {
      return LINK_TO_HTML[id];
    },

    registerLinkType: function (data) {
      LINK_TO_HTML[data.id] = data;
      LINK_FROM_HTML[data.class] = data;
    },
    deregisterLinkType: function (id) {
      var data = LINK_TO_HTML[id];
      if (data) {
        delete LINK_TO_HTML[id];
        delete LINK_FROM_HTML[data.class];
      }
    },

    INLINE_TAGS: INLINE_TAGS,
  };
});

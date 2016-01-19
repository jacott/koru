define(function(require, exports, module) {
  require('./html-doc');
  var Dom = require('koru/dom-base');
  var util = require('koru/util');

  var TEXT_NODE = document.TEXT_NODE;

  var OL = 1, NEST = 2, BOLD = 3, ITALIC = 4, UL = 5, LINK = 6, UNDERLINE = 7;

  var LINK_TO_HTML = [
    {
      id: 0,
      class: "",
      fromHtml: function (node) {return node.getAttribute('href')},
      toHtml: function (node, ref) {node.setAttribute('href', ref)},
    },
  ];

  var LINK_FROM_HTML = {
    '': LINK_TO_HTML[0]
  };

  var INLINE_TAGS = {
    B: 'inline',
    U: 'inline',
    I: 'inline',
    A: 'inline',
    SPAN: 'inline',
  };

  function fromHtml(html) {
    var builder = new MarkupBuilder();
    builder.fromChildren(html, {rule: fromDiv});
    var markup = util.flatten(builder.markup);
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
        rule.call(this, node, index);
        entry[1] = this.markup.length - 1;
      }
      this.inlineIdx = i;
    },

    ignoreInline: function () {},

    fromChildren: function(parent, state) {
      var nodes = parent.childNodes;
      var last = state.last = nodes.length - 1;
      for(var index = 0; index <= last; ++index) {
        this.needNL && this.newLine();
        var node = nodes[index];
        if(node.tagName === 'BR') {
          if (node !== parent.lastChild)
            this.newLine();
          continue;
        }

        if (isInlineNode(node)) {
          if (node.nodeType === TEXT_NODE) {
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
          this.inlineIdx && this.newLine();
          state.rule.call(this, node, state);
          this.resetInlines();
          this.needNL = true;
        }
      }
    },

    fromText: function(parent, node) {
      if (node.nodeType === TEXT_NODE || node.tagName === 'BR') {
        this.lines.push(node.textContent);
        return true;
      }
    },
  };


  function fromDiv(node, state) {
    if (this.fromText(node, state)) return;

    var rule = FROM_RULE[node.tagName] || fromDiv;
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
        state.start = this.lines.length - 1;
          state.endMarker = this.markup.length + 2;
        this.markup.push(code, this.relative(state.start), 0);
      }
      var rule = FROM_RULE[node.tagName] || fromDiv;
      this.fromChildren(node, rule === fromDiv ? state : {rule: rule});

      this.markup[state.endMarker] = this.lines.length - 1 - state.start;
    };
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

  function toBlock(tag) {
    return function(state) {
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

  function toInline(tag) {
    function toInlineTag(state) {
      var oldResult = state.result;
      oldResult.appendChild(state.result = document.createElement(tag));
      this.toChildren(state);
      state.result = oldResult;
    } toInlineTag.inline = true; toInlineTag.muInc = 4;

    return toInlineTag;
  };

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

  TO_RULES[BOLD] = toInline('B');
  TO_RULES[ITALIC] = toInline('I');
  TO_RULES[UNDERLINE] = toInline('U');
  TO_RULES[LINK] = toLink;

  function isInlineNode(item) {
    return item.nodeType === TEXT_NODE || INLINE_TAGS[item.tagName];
  }

  return {
    toHtml: toHtml,

    fromHtml: fromHtml,

    isValid: function (text, markup) {
      if (text == null && markup == null) return true;
      if (typeof text !== 'string' || ! (markup == null || Array.isArray(markup)))
        return false;

      var html = toHtml(text, markup, document.createElement('div'));
      var rt = fromHtml(html);


      return text === rt[0].join('\n') && util.deepEqual(rt[1], markup);
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

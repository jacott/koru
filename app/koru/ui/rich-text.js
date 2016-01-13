define(function(require, exports, module) {
  require('./html-doc');
  var Dom = require('koru/dom-base');
  var util = require('koru/util');

  var TEXT_NODE = document.TEXT_NODE;

  var OL = 1, NEST = 2, BOLD = 3, ITALIC = 4, UL = 5, SPAN = 6;

  var CODE_TO_LINK = [
    'link user',
    'link ticket',
  ];

  var LINK_TO_CODE = {};
  CODE_TO_LINK.forEach(function (name, index) {LINK_TO_CODE[name] =  index});

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
    return [builder.lines, builder.markup.length ? builder.markup : null];
  }

  function MarkupBuilder() {
    this.markup = [];
    this.lines = [];
  }

  MarkupBuilder.prototype = {
    constructor: MarkupBuilder,

    fromChildren: function(parent, state) {
      var nodes = parent.childNodes;
      state.last = nodes.length - 1;
      for(var index = 0; index < nodes.length; ++index) {
        var node = nodes[index];
        if (node.tagName === 'BR') {
          this.lines.push('');
        } else if (isInlineNode(node)) {
          var isInline = state.inline;
          if (! isInline) {
            index || this.lines.push('');
            state.inline = true;
          }
          if (node.nodeType === TEXT_NODE) {
            this.lines[this.lines.length - 1] += node.textContent;
          } else {
            var rule = FROM_RULE[node.tagName];
            rule ? rule.call(this, node, state) : this.lines[this.lines.length - 1] += node.textContent;
          }
          state.inline = isInline;
        } else if (! state.inline) {
          state.rule.call(this, node, state);
        }
      }
      --state.inline;
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
    this.fromChildren(node, rule === fromDiv ? state : {oldState: state, rule: rule});
  }

  function fromInline(code) {
    return function fromInline(node, state) {
      var index = this.lines.length - 1;
      this.markup.push(code, index, this.lines[index].length, 0);
      var pos = this.markup.length - 1;
      this.fromChildren(node, state);
      this.markup[pos] = this.lines[index].length;
    };
  }

  function fromBlock(code) {
    return function fromBlock(node, state) {
      if (state.start === undefined) {
        state.start = this.lines.length;
          state.endMarker = this.markup.length + 2;
        this.markup.push(code, state.start, 0);
      }
      var rule = FROM_RULE[node.tagName] || fromDiv;
      this.fromChildren(node, rule === fromDiv ? state : {oldState: state, rule: rule});

      this.markup[state.endMarker] = this.lines.length - 1;
    };
  }

  var FROM_RULE = {
    DIV: fromDiv,
    OL: fromBlock(OL),
    UL: fromBlock(UL),
    BLOCKQUOTE: fromBlock(NEST),
    P: fromDiv,
    B: fromInline(BOLD),
    I: fromInline(ITALIC),

    SPAN: function (node, state) {
      var index = this.lines.length - 1;
      var code = LINK_TO_CODE[node.className];
      if (code !== undefined) {
        this.markup.push(SPAN, index, this.lines[index].length, 0, code, node.getAttribute("data-a"));
        var pos = this.markup.length - 3;
        this.fromChildren(node, state);
        this.markup[pos] = this.lines[index].length;
      }
      else {
        this.fromChildren(node, state);
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
    this.midx = 0;
    var nextMarkup = this.offset(1);
    var state = {result: html, rule: toDiv, begun: true};

    var nrule;
    for(var index = 0; index < lines.length; ++index) {
      this.line = lines[this.lidx = index];
      while (index === nextMarkup && ! (nrule = TO_RULES[this.offset(0)]).inline) {
        state = {result: state.result, rule: nrule, last: this.offset(2), oldState: state};
        state.rule.call(this, state);
        nextMarkup = this.offset(1);
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

    toChildren: function(state) {
      var nextMarkup = this.offset(1);
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
          this.midx += rule.muInc,

          state.rule.call(this, state);
          startPos = state.inlineEnd;
          state = state.oldState;
          state.inlineStart = startPos;

          nextMarkup = this.offset(1);
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
      this.midx += 3;
    };
  }

  function toBlock(tag) {
    return function(state) {
      if (! state.begun)
        return state.begun = true;
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

  function toSpan(state) {
    var oldResult = state.result;
    oldResult.appendChild(state.result = document.createElement('SPAN'));
    state.result.className = CODE_TO_LINK[this.offset(-2)];
    state.result.setAttribute('contenteditable', 'true');
    state.result.setAttribute('data-a', this.offset(-1));
    this.toChildren(state);
    state.result = oldResult;
  } toSpan.inline = true; toSpan.muInc = 6;

  var TO_RULES = [];
  TO_RULES[0] = toDiv;
  TO_RULES[OL] = toNested('OL', toLi);
  TO_RULES[UL] = toNested('UL', toLi);
  TO_RULES[NEST] = toNested('BLOCKQUOTE', toDiv);

  TO_RULES[BOLD] = toInline('B');
  TO_RULES[ITALIC] = toInline('I');
  TO_RULES[SPAN] = toSpan;

  function isInlineNode(item) {
    return item.nodeType === TEXT_NODE || INLINE_TAGS[item.tagName];
  }

  return {
    toHtml: toHtml,

    fromHtml: fromHtml,

    INLINE_TAGS: INLINE_TAGS,
  };
});

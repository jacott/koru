define(function(require, exports, module) {
  require('./html-doc');
  var Dom = require('koru/dom-base');
  var util = require('koru/util');

  var TEXT_NODE = document.TEXT_NODE;

  var OL = 1, NEST = 2, BOLD = 3, ITALIC = 4, UL = 5;

  var INLINE_TAGS = {
    B: 'inline',
    U: 'inline',
    I: 'inline',
    A: 'inline',
    SPAN: 'inline',
  };

  function fromText(lines, markup, node) {
    if (node.nodeType === TEXT_NODE || node.tagName === 'BR') {
      lines.push(node.textContent);
      return true;
    }
  }

  function fromDiv(lines, markup, node, state) {
    if (fromText(lines, markup, node, state)) return;

    var rule = FROM_RULE[node.tagName] || fromDiv;
    fromChildren(lines, markup, node, rule === fromDiv ? state : {oldState: state, rule: rule});
  }

  function fromInline(code) {
    return function fromInline(lines, markup, node, state) {
      var index = lines.length - 1;
      markup.push(code, index, lines[index].length, 0);
      var pos = markup.length - 1;
      fromChildren(lines, markup, node, state);
      markup[pos] = lines[index].length;
    };
  }

  function fromBlock(code) {
    return function fromBlock(lines, markup, node, state) {
      if (state.start === undefined) {
        state.start = lines.length;
        state.endMarker = markup.length + 2;
        markup.push(code, state.start, 0);
      }
      var rule = FROM_RULE[node.tagName] || fromDiv;
      fromChildren(lines, markup, node, rule === fromDiv ? state : {oldState: state, rule: rule});

      markup[state.endMarker] = lines.length - 1;
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
  };

  var toLi = toBlock('LI');
  var toDiv = toBlock('DIV');

  function toNested(blockTag, innerFunc) {
    return function toNested(line, index, markup) {
      this.begun = true;
      this.result.appendChild(this.result = document.createElement(blockTag));
      this.rule = innerFunc;
      this.pos += 3;
    };
  }

  function toBlock(tag) {
    return function(line, index, markup) {
      if (! this.begun)
        return this.begun = true;
      var oldResult = this.result;
      oldResult.appendChild(this.result = document.createElement(tag));
      toChildren(line, index, markup, this);
      this.result = oldResult;
    };
  }

  function toInline(tag) {
    toInlineTag.inline = true;
    toInlineTag.muInc = 4;
    return toInlineTag;
    function toInlineTag(line, index, markup) {
      var oldResult = this.result;
      oldResult.appendChild(this.result = document.createElement(tag));
      toChildren(line, index, markup, this);
      this.result = oldResult;
    }
  };

  var TO_RULES = [];
  TO_RULES[0] = toDiv;
  TO_RULES[OL] = toNested('OL', toLi);
  TO_RULES[UL] = toNested('UL', toLi);
  TO_RULES[NEST] = toNested('BLOCKQUOTE', toDiv);

  TO_RULES[BOLD] = toInline('B');
  TO_RULES[ITALIC] = toInline('I');

  return {
    toHtml: toHtml,

    fromHtml: function (html) {
      var lines = [], markup = [];
      var state = {rule: fromDiv};
      fromChildren(lines, markup, html, state);
      return [lines, markup.length ? markup : null];
    },

    INLINE_TAGS: INLINE_TAGS,
  };

  function toChildren(line, index, markup, state) {
    var nmu = markup[state.pos+1];
    var startPos = state.inlineStart || 0;
    var endPos = state.inlineEnd || line.length;

    if (index === nmu) {
      while(index === nmu && markup[state.pos+2] <= endPos) {
        var rule = TO_RULES[markup[state.pos]];

        var text = line.slice(state.inlineStart || 0, markup[state.pos+2]);
        if (text)
          state.result.appendChild(document.createTextNode(text));
        startPos = markup[state.pos+3];

        state = {
          result: state.result,
          oldState: state,
          rule: rule,
          pos: state.pos + rule.muInc,
          inlineStart: markup[state.pos+2],
          inlineEnd: markup[state.pos+3]
        };
        state.rule(line, index, markup);
        state.oldState.pos = state.pos;
        state = state.oldState;

        nmu = markup[state.pos+1];
      }
    }
    if (! line) {
      state.result.appendChild(document.createElement('BR'));
    } else {
      var text = line.slice(startPos, endPos);
      text &&
        state.result.appendChild(document.createTextNode(text));
    }
  }

  function isInlineNode(item) {
    return item.nodeType === TEXT_NODE || INLINE_TAGS[item.tagName];
  }

  function toHtml(lines, markup, result) {
    lines = typeof lines === 'string' ? lines.split("\n") : lines;
    markup = markup || [];

    result = result || document.createDocumentFragment();

    var nrule;
    var nmu = markup[1];
    var state = {result: result, rule: toDiv, pos: 0, begun: true};
    for(var index = 0; index < lines.length; ++index) {
      var line = lines[index];
      while (index === nmu && ! (nrule = TO_RULES[markup[state.pos]]).inline) {
        state = {result: state.result, rule: nrule, last: markup[state.pos+2], pos: state.pos, oldState: state};
        state.rule(line, index, markup);
        nmu = markup[state.pos+1];
      }
      state.rule(line, index, markup, state);

      while (state.last === index) {
        var pos = state.pos;
        state = state.oldState;
        state.pos = pos;
      }
    }

    return result;
  }

  function fromChildren(lines, markup, parent, state) {
    var nodes = parent.childNodes;
    state.last = nodes.length - 1;
    util.forEach(nodes, function (node, index) {
      if (node.tagName === 'BR') {
        lines.push('');
      } else if (isInlineNode(node)) {
        var isInline = state.inline;
        if (! isInline) {
          index || lines.push('');
          state.inline = true;
        }
        if (node.nodeType === TEXT_NODE) {
          lines[lines.length - 1] += node.textContent;
        } else {
          var rule = FROM_RULE[node.tagName];
          rule ? rule(lines, markup, node, state) : lines[lines.length - 1] += node.textContent;
        }
        state.inline = isInline;
      } else if (! state.inline) {
        state.rule(lines, markup, node, state);
      }
    });
    --state.inline;
  }
});

define((require, exports, module) => {
  'use strict';
  const {parse, visitorKeys} = require('koru/parse/js-ast');
  const {last}          = require('koru/util');

  const SameLineWsRE = /[^\S\n]+/yg;

  const WS_NO_NL_CHAR = {
    __proto__: null,
    ' ': true, '\t': true, '\r': true,
  };

  const WS_CHAR = {
    __proto__: null,
    ...WS_NO_NL_CHAR, '\n': true,
  };

  const lastLeftMatchingIndex = (map, string, idx, end=0) => {
    while (idx > end) {
      --idx;
      const char = string[idx];
      if (map[char] === undefined) {
        return idx + 1;
      }
    }
    return idx;
  };

  const lastRightMatchingIndex = (map, string, idx, end=string.length) => {
    while (idx < end) {
      const char = string[idx];
      if (map[char] === undefined) {
        return idx;
      }
      ++idx;
    }
    return idx;
  };

  const setComment = (printer, idx) => {
    const {comments} = printer.ast;
    printer.commentIndex = idx;
    if (idx < comments.length) {
      const node = printer.ast.comments[idx];
      printer.commentStart = Math.max(
        printer.commentEnd, lastLeftMatchingIndex(WS_CHAR, printer.input,
                                                  node.start, this.inputPoint));
      const farEnd = lastRightMatchingIndex(WS_CHAR, printer.input,
                                            node.end);

      printer.commentEnd = lastLeftMatchingIndex(WS_NO_NL_CHAR, printer.input,
                                                 farEnd - 1, node.end);

      if (! WS_NO_NL_CHAR[printer.input[printer.commentEnd]]) {
        ++printer.commentEnd;
      }
    } else {
      printer.commentEnd = printer.commentStart = printer.input.length;
    }
  };

  class JsPrinter {
    inputPoint = 0;
    lastToken = '';
    lastLine = 0;
    lastNode = undefined;

    constructor({input, write, ast=parse(input)}) {
      this.input = input;
      this.write = write;
      this.ast = ast;
      this.commentIndex = 0;
      if (ast.comments.length == 0) {
        this.commentEnd = this.commentStart = input.length;
      } else {
        this.commentEnd = -1;
        setComment(this, 0);
      }
    }

    print(node, skipEndCatchup=false) {
      if (Array.isArray(node)) {
        for (const n of node) {
          this.print(n);
        }
      } else if (node != null) {
        if (this.inputPoint > node.start) {
          throw new Error('advanced past node start! ' + this.inputPoint + ' > ' + node.start);
        }
        this.catchup(node.start);
        const method = this[node.type];
        if (method !== undefined) {
          method.call(this, node);
        } else {
          for (const key of visitorKeys(node)) {
            this.print(node[key]);
          }
        }
        skipEndCatchup || this.catchup(node.end);
        this.lastNode = node;
        this.lastLine = node.loc.end.line;
      }
    }

    nextMatchingChar(map, start=this.inputPoint, end) {
      return lastRightMatchingIndex(map, this.input, start, end);
    }

    indexOf(string, point) {
      if (this.inputPoint > point) return this.inputPoint;
      let {commentIndex} = this;
      const {comments} = this.ast;
      while (true) {
        const idx = this.input.indexOf(string, point);
        if (idx == -1) throw new Error(string + ' not found! ' + point);
        point = idx;
        for (;commentIndex < comments.length; ++ commentIndex) {
          const c = comments[commentIndex];
          if (c.end > point) {
            if (c.start > point) break;
            point = c.end;
          }
        }
        if (idx == point) return idx + string.length;
      }
    }

    lastIndexOf(string, point) {
      let {commentIndex} = this;
      const {comments} = this.ast;
      for (;commentIndex < comments.length; ++commentIndex) {
        if (comments[commentIndex].start > point) break;
      }
      --commentIndex;
      while (true) {
        const idx = this.input.lastIndexOf(string, point);
        if (idx == -1) throw new Error(string + ' not found!');
        point = idx;

        for (;commentIndex >= 0; --commentIndex) {
          const c = comments[commentIndex];
          if (c.start < point) {
            if (c.end < point) break;
            point = c.start;
          }
        }
        if (idx == point) return idx;
      }
    }

    sourceOfNode(node) {return this.input.slice(node.start, node.end)}
    inputFromPoint(last) {return this.input.slice(this.inputPoint, last)}

    addComment() {
      const {comments} = this.ast;
      const node = comments[this.commentIndex];
      const maxPoint = this.commentIndex + 1 < comments.length
            ? comments[this.commentIndex + 1].start
            : this.input.length;

      const text = this.input.slice(Math.max(this.inputPoint, this.commentStart), this.commentEnd);
      if (text !== '') {
        this.write(text, 'comment');
      }

      if (this.commentEnd > this.inputPoint) this.inputPoint = this.commentEnd;
      setComment(this, this.commentIndex + 1);
    }

    writeComments(point) {
      while (this.commentStart < point && this.commentStart < this.input.length) {
        this.addComment();
      }
    }

    advance(point) {
      this.writeComments(point);
      if (point > this.inputPoint) {
        this.inputPoint = point;
      }
    }

    skipOverNl(maxNl) {
      let nl = false;
      for (let point = this.nextStopPoint(); point !== -1; point = this.nextStopPoint()) {
        if (this.input[point] !== '\n') return nl;
        nl = true;
        if (--maxNl >= 0) this.write('\n');
        this.advance(point + 1);
      }
      return nl;
    }

    isAtNewline() {
      return this.input[this.inputPoint] === '\n';
    }

    isAtWs() {
      return WS_CHAR[this.input[this.inputPoint]] !== undefined;
    }

    writeGapIfNeeded() {
      if (! this.isAtWs()) this.write(' ');
    }

    nextStopPoint(ignorePadding=false) {
      const {input} = this;
      const len = input.length;
      for (let i = this.inputPoint; i < len; ++i) {
        const char = input[i];
        if (char === '/') return ignorePadding ? i : this.inputPoint;
        if (char === '\n' || WS_CHAR[char] === undefined) return i;
      }
      return -1;
    }

    skipOver(regex=SameLineWsRE, write=false) {
      const len = this.input.length;
      const re = regex.global && regex.sticky ? regex : new RegExp(regex.source, 'yg');
      while (this.inputPoint === this.commentStart) {
        if (this.inputPoint >= len) return;
        this.addComment();
      }
      while (this.inputPoint < len) {
        re.lastIndex = this.inputPoint;
        const m = re.exec(this.input);
        if (m === null) {
          if (this.commentStart >= this.inputPoint) return;
          this.addComment();
        } else {
          if (write) this.write(m[0]);
          this.inputPoint = Math.min(this.commentStart, m.index + m[0].length);
          this.writeComments(this.inputPoint);
          return m[0];
        }
      }
    }

    writeAdvance(string) {
      const point = this.indexOf(string, this.inputPoint);
      this.advance(point - string.length);
      this.write(string);
      this.advance(point);
    }

    writeCatchup(string) {
      for (let re = /[^\][(){}\n]+/yg; re.lastIndex < string.length; ++re.lastIndex) {
        const s = re.lastIndex;
        const m = re.exec(string);
        if (m !== null) {
          this.write(m[0], 'catchup');
          if (re.lastIndex == string.length) return;
        } else {
          re.lastIndex = s;
        }
        this.write(string[re.lastIndex], 'catchup');
      }
    }

    catchup(point) {
      if (this.inputPoint >= point) return;
      while (this.commentStart < point && this.commentStart < this.input.length) {
        this.writeCatchup(this.input.slice(this.inputPoint, this.commentStart));
        this.addComment();
      }
      this.writeCatchup(this.input.slice(this.inputPoint, point));
      if (point > this.inputPoint) this.inputPoint = point;
    }

    TemplateLiteral(node) {
      this.catchup(node.start);
      const {quasis, expressions} = node;
      for (let i = 0; i < expressions.length; ++i) {
        this.print(quasis[i]);
        this.print(expressions[i]);
      }
      this.print(last(quasis));
    }
  }

  JsPrinter.SameLineWsRE = SameLineWsRE;

  return JsPrinter;
});

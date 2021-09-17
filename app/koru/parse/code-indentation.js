define((require, exports, module) => {
  const INC_INDENT = {
    __proto__: null,
    '(': true,
    '[': true,
    '{': true,
  };

  const DEC_INDENT = {
    __proto__: null,
    ')': true,
    ']': true,
    '}': true,
  };

  const TEXT_TYPE = {
    __proto__: null,
    string: true,
    template: true,
    comment: true,
  };

  const lookingFor = [/^\*/, /^\/\*+[^\S\n]*/];

  const extractCommentPiece = (ci, piece, lookingForIdx, extraIndent) => {
    if (ci.needsPadding) {
      piece = piece.trimStart();

      if (lookingForIdx >= 0) {
        const m = lookingFor[lookingForIdx].exec(piece);
        if (m !== null) {
          extraIndent = ''.padEnd(m[0].length);
        }
        if (lookingForIdx == 0) {
          piece = extraIndent+piece;
        }
      } else if (extraIndent.length > 1 && /^\*+\//.test(piece)) {
        extraIndent = '';
      } else {
        piece = extraIndent+piece;
      }
    }
    ci.append(piece, 'comment');
    return extraIndent;
  };

  class CodeIndentation {
    constructor({initialIndent=0, tabWidth=2}={}) {
      this.indents = [initialIndent, initialIndent];
      this.output = '';
      this.line = '';
      this.needsPadding = true;
      this.lineIndentStart = 2;
      this.lineIndent = initialIndent;
      this.lineStartPadding = initialIndent;
      this.currentIndex = this.indents.length;
      this.tabWidth = tabWidth;
      this.dir = 0;
    }

    write(text) {
      this.output += text;
    }

    last(pos=1) {
      return this.indents[this.currentIndex - pos];
    }

    setLast(pos, value) {
      return this.indents[this.currentIndex - pos] = value;
    }

    newLine(token, type) {
      const li = this.last();
      const slen = this.line.length - token.length - li;

      if (this.lineIndentStart < this.currentIndex) {
        if (slen == 0) {
          this.lineIndent = this.setLast(1, this.last(2) + 2);
        } else {
          this.lineIndent = li;
        }
      } else if (this.currentIndex == this.lineIndentStart) {
        if (this.lineIndent < this.lineStartPadding) {
          if (slen == 0) {
            this.lineIndent = this.setLast(1, this.lineStartPadding);
          } else {
            this.lineIndent = li;
          }
        } else if (this.dir > 0) {
          this.lineIndent = this.last(2) + (this.dir > 0 ? 2 : 0);
        }
      } else if (this.dir != 0) {
        if (this.dir > 0) {
          this.lineIndent = this.last(2) + 2;
        } else {
          this.lineIndent = li;
        }
      }
      this.output += this.line.replace(/\s+$/, '\n');
      this.line = '';
      this.needsPadding = true;
      this.lineIndentStart = this.currentIndex;
      this.indents.length = this.currentIndex;
      this.lastDir = this.dir;
      this.dir = 0;
      this.lineStartPadding = this.lineIndent;
    }

    incIndent() {
      this.dir = 1;
      let {indents, currentIndex} = this;
      if (currentIndex >= indents.length) {
        indents.push(this.lineIndent, this.line.length);
      } else if (currentIndex+2 >= this.lineIndentStart) {
        indents[currentIndex+1] = this.line.length;
      }
      this.currentIndex = currentIndex+2;
    }

    decIndent() {
      this.dir = -1;
      this.currentIndex -= 2;
      if (this.currentIndex >= this.lineIndentStart) {
        this.indents.length -= 2;
      }
      if (this.needsPadding) {
        this.lineIndent = this.last(1);
      }
    }

    appendComment(token) {
      const re = /.*?([^\S\n]*\n)/yg;
      let m;
      let idx = 0;
      const docComment = /\s*\/\*\*/.test(token);
      let extraIndent = '';
      let lookingForIdx = 2;
      while ((m = re.exec(token)) !== null) {
        let piece = token.slice(idx, m.index + m[0].length - 1).trimEnd() + '\n';
        if (piece === '\n') {
          this.append('\n', 'comment');
        } else {
          extraIndent = extractCommentPiece(this, piece, --lookingForIdx, extraIndent);
        }
        idx = re.lastIndex;
      }

      if (idx == 0) {
        this.append(token, 'comment');
      } else if (idx < token.length) {
        extractCommentPiece(this, token.slice(idx), --lookingForIdx, extraIndent);
      }
    }

    append(token, type) {
      this.lastToken = token;
      this.line += token;

      if (type !== 'noIndent') {
        const isCode = TEXT_TYPE[type] === void 0;
        if (isCode && DEC_INDENT[token] !== void 0) {
          this.decIndent();
          return;
        }

        if (this.needsPadding) {
          this.line = ''.padEnd(type === 'unindent' ? this.lineIndent - 2 : this.lineIndent) + this.line;
          this.needsPadding = false;
        }

        if (isCode && INC_INDENT[token] !== void 0) {
          this.incIndent();
          return;
        }
      }

      if (token === '\n' || type === 'comment' && token[token.length - 1] === '\n') {
        this.newLine(token, type);
      }
    }

    complete() {
      this.append('');
      this.newLine('');
      return this.output;
    }
  }

  return CodeIndentation;
});

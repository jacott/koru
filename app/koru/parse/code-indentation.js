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
    if (ci.line === '') {
      piece = piece.trimStart();

      if (lookingForIdx >= 0) {
        const m = lookingFor[lookingForIdx].exec(piece);
        if (m !== null) {
          extraIndent = ''.padEnd(m[0].length);
        }
        if (lookingForIdx == 0) {
          piece = extraIndent + piece;
        }
      } else if (extraIndent.length > 1 && /^\*+\//.test(piece)) {
        extraIndent = '';
      } else {
        piece = extraIndent + piece;
      }
    }
    ci.append(piece, 'comment');
    return extraIndent;
  };

  class CodeIndentation {
    constructor({tabWidth=2, initialIndent=0}={}) {
      this.tabWidth = tabWidth;
      this.lineIndent = initialIndent;
      this.indents = [-initialIndent];
      this.startLen = this.indents.length;
      this.mode = 0;
      this.extraIndent = 0;
      this.output = '';
      this.line = '';
    }

    write(text) {
      this.output += text;
    }

    newLine(token, type) {
      const line = this.line.replace(/\s+$/, token);

      let indent = this.lineIndent;

      const cpos = line.length - 1 + this.lineIndent;

      this.recalcIndent();

      if (this.indents.length > this.startLen) {
        if (INC_INDENT[this.lastToken] !== undefined) {
          this.lineIndent += this.tabWidth;
        } else {
          this.lineIndent = this.indentAt(-1);
        }
        this.addIndent(- this.lineIndent);
      }
      if (line === '\n') {
        this.output += line;
      } else {
        this.output += ''.padEnd(indent + this.extraIndent) + line;
      }
      this.mode = 0;
      this.extraIndent = 0;
      this.startLen = this.indents.length;
      this.line = '';
    }

    indentAt(idx) {
      return Math.abs(this.indents.at(idx));
    }

    addIndent(v) {
      this.indents.push(v);
    }

    recalcIndent() {
      let idx = this.indents.findLastIndex((v) => v <= 0);
      if (idx === -1) {
        throw new Error('too many unindents');
      }
      this.lineIndent = this.indentAt(idx);
      this.startLen = idx + 1;
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
      this.line += token;
      if (type !== undefined && TEXT_TYPE[type] !== undefined) {
        if (type === 'comment' && token.at(-1) === '\n') {
          this.newLine('\n', type);
        } else if (this.mode == 0) {
          this.mode = 1;
        }

        return;
      }

      this.#actionToken(token, type);
      this.lastToken = token;
    }

    #actionToken(token, type) {
      if (token === '\n') {
        this.newLine('\n', type);
        return;
      }

      if (DEC_INDENT[token] !== undefined) {
        while (this.indents.pop() < 0) {}
        if (this.mode == 0) {
          this.mode = 1;
          this.recalcIndent();
        }

        return;
      }

      if (this.mode == 0) {
        this.mode = 1;
      }

      if (INC_INDENT[token] !== undefined) {
        this.addIndent(this.lineIndent + this.line.length);
        return;
      }
    };

    complete() {
      if (this.line !== '') this.append('');
      this.newLine('');
      return this.output;
    }
  }

  return CodeIndentation;
});

define((require, exports, module) => {
  'use strict';
  const {parse, visitorKeys} = require('koru/parse/js-ast');

  class JsPrinter {
    inputPoint = 0;
    commentIndex = 0;

    constructor({input, writer, ast=parse(input)}) {
      this.input = input;
      this.writer = writer;
      this.ast = ast;
    }

    print(node) {
      if (Array.isArray(node)) {
        for (const n of node) {
          this.print(n);
        }
      } else if (node != null) {
        const method = this[node.type];
        if (method !== void 0) {
          method.call(this, node);
        } else {
          this.catchup(node.start);
          for (const key of visitorKeys(node)) {
            this.print(node[key]);
          }
        }
      }
    }

    sourceOfNode(node) {
      return this.input.slice(node.start, node.end);
    }

    addComment(node) {
      this.writer(this.input.slice(node.start, node.end));
      this.inputPoint = node.end;
    }

    lookingAt(regex, last) {
      return regex.exec(this.input.slice(this.inputPoint, last));
    }

    catchup(point) {
      if (this.inputPoint >= point) return;
      const {comments} = this.ast;
      while (this.commentIndex < comments.length) {
        const c = comments[this.commentIndex];
        if (c.start > point) break;
        if (c.start > this.inputPoint) {
          this.writer(this.input.slice(this.inputPoint, c.start));
        }
        this.addComment(c)
        ++this.commentIndex;
      }
      this.writer(this.input.slice(this.inputPoint, point));
      this.inputPoint = point;
    }
  }

  return JsPrinter;
});

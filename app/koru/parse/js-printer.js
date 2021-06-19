define((require, exports, module) => {
  'use strict';
  const {parse, walk, walkArray} = require('koru/parse/js-ast');

  class JsPrinter {
    inputPoint = 0;
    commentIndex = 0;

    constructor({input, writer, ast=parse(input)}) {
      this.input = input;
      this.writer = writer;
      this.ast = ast;
    }

    print(node) {
      const visitor = (node) => {
        if (node == null) return 2;

        const method = this[node.type];
        if (method !== void 0) {
          method.call(this, node);
          return 2;
        }

        return 1;
      }

      if (Array.isArray(node)) {
        for (const n of node) {
          walk(n, visitor);
          this.catchup(n.end);
        }
      } else {
        walk(node, visitor);
        this.catchup(node.end);
      }

    }

    addComment(node) {
      this.writer(this.input.slice(node.start, node.end));
      this.inputPoint = node.end;
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

define((require, exports, module) => {
  'use strict';
  const {parse, visitorKeys} = require('koru/parse/js-ast');
  const {last}          = require('koru/util');

  class JsPrinter {
    inputPoint = 0;
    commentIndex = 0;

    constructor({input, write, ast=parse(input)}) {
      this.input = input;
      this.write = write;
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

    sourceOfNode(node) {return this.input.slice(node.start, node.end)}

    addComment(node) {
      this.write(this.input.slice(node.start, node.end), 'comment');
      this.advance(node.end);
    }

    lookingAt(regex, last) {
      return regex.exec(this.input.slice(this.inputPoint, last));
    }

    advance(point) {if (point > this.inputPoint) this.inputPoint = point}

    catchup(point) {
      if (this.inputPoint >= point) return;
      const {comments} = this.ast;
      while (this.commentIndex < comments.length) {
        const c = comments[this.commentIndex];
        if (c.start > point) break;
        if (c.start > this.inputPoint) {
          this.write(this.input.slice(this.inputPoint, c.start), 'catchup');
        }
        this.addComment(c);
        ++this.commentIndex;
      }
      this.write(this.input.slice(this.inputPoint, point), 'catchup');
      this.advance(point);
    }

    TemplateLiteral(node) {
      this.catchup(node.start);
      const {quasis, expressions} = node;
      for(let i = 0; i < expressions.length; ++i) {
        this.print(quasis[i]);
        this.print(expressions[i]);
      }
      this.print(last(quasis));
    }
  }

  return JsPrinter;
});

define((require, exports, module) => {
  'use strict';
  const {parse}         = require('koru/parse/js-ast');
  const JsPrinter       = require('koru/parse/js-printer');
  const {qstr, last}    = require('koru/util');

  class MyPrinter extends JsPrinter {
    StringLiteral(node) {
      this.catchup(node.start);
      const raw = node.extra.raw;
      this.writer(raw?.[0] === "'" ? raw : qstr(node.value));
      this.inputPoint = node.end;
    }

    ArrowFunctionExpression(node) {
      this.catchup(node.start);
      node.async && this.writer('async ');
      this.writer('(');
      if (node.params.length != 0) {
        this.inputPoint = node.params[0].start;
        this.print(node.params);
        this.inputPoint = last(node.params).end;
      }
      const idx = this.input.indexOf('=>', this.inputPoint);
      this.writer(') => ');
      this.inputPoint = idx+ (this.input[idx+2] === ' ' ? 3 : 2 );
      this.print(node.body);
      this.catchup(node.body.end);
    }
  }

  return {
    reformat: (input, {ignoreSyntaxError=true}={}) => {
      let ast;
      try {
        ast = parse(input, { errorRecovery: true, plugins: ['classProperties'] });
      } catch (err) {
        if (ignoreSyntaxError && err.name === 'SyntaxError') return input;
        throw err;
      }

      if (ast !== void 0) {
        let output = '';

        const writer = (token) => {output += token};

        const printer = new MyPrinter({input, writer, ast});

        printer.print(ast);

        return output;
      }

      return input;
    }};
});

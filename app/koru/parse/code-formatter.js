define((require, exports, module) => {
  'use strict';
  const {parse, visitorKeys} = require('koru/parse/js-ast');
  const JsPrinter       = require('koru/parse/js-printer');
  const {qstr, last}    = require('koru/util');

  const termRE = /^[\},;]$/;

  const isSameEndLine = (p, c) => p.loc.end.line == c.loc.end.line;

  class MyPrinter extends JsPrinter {
    printParams(params) {
      if (params.length != 0) {
        this.advance(params[0].start);
        for (const n of params) {
          this.print(n);
          this.catchup(n.end);
        }
        this.advance(last(params).end);
      }
    }

    printBlock(node) {
      if (node.body.length == 0) return;
      const ln = last(node.body);
      for (const n of node.body) {
        this.print(n);
        this.catchup(n.end-2);
        if (this.input[n.end-1] !== ';') {
          this.catchup(n.end);
          if (! termRE.test(this.input[n.end-1])) {
            if (ln === n && isSameEndLine(node, n)) {
              this.catchup(n.end);
              this.advance(node.end - 1);
              break;
            }
            this.write(';');
          }
        } else {
          if (ln === n && isSameEndLine(node, n)) {
            this.catchup(n.end - 1);
            this.advance(node.end - 1);
            break;
          }
          this.catchup(n.end);
        }

        this.advance(n.end);
      }
    }

    EmptyStatement(node) {
      this.catchup(node.start);
      this.advance(node.end);
    }

    StringLiteral(node) {
      this.catchup(node.start);
      const raw = node.extra.raw;
      this.write(raw?.[0] === "'" ? raw : qstr(node.value));
      this.advance(node.end);
    }

    TemplateElement(node) {
      this.catchup(node.start);
      this.write(node.value.raw);
      this.advance(node.end);
    }

    ArrowFunctionExpression(node) {
      this.catchup(node.start);
      node.async && this.write('async ');
      this.write('(');
      this.printParams(node.params);

      const idx = this.input.indexOf('=>', this.inputPoint);
      this.write(') => ');
      this.advance(idx+ (this.input[idx+2] === ' ' ? 3 : 2 ));
      this.print(node.body);
    }

    Program(node) {
      this.catchup(node.start);
      this.printBlock(node);
    }

    ClassBody(node) {
      this.catchup(node.start);
      this.printBlock(node);
    }

    BlockStatement(node) {
      this.catchup(node.start);
      this.printBlock(node);
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

      if (ast === void 0) return input;

      let output = '', lastToken = '';

      const write = (token, type) => {
        if (type === 'catchup') {
          if (lastToken !== '' && /^\s*$/.test(lastToken)) {
            token = lastToken + token;
            lastToken = '';
          }
          token = token
            .replace(/[ \t\v\f\r]+\n/g, '\n')
            .replace(/\n{2,}/g, '\n\n')
            .replace(/\n{2,}([ \t]*)\}(;)?$/, '\n$1}$2');
        }

        if (lastToken !== '') output += lastToken;
        if (type === 'catchup') {
          lastToken = token;
        } else {
          output += token;
          lastToken = '';
        }
      };

      const printer = new MyPrinter({input, write, ast});

      printer.print(ast);

      printer.catchup(ast.end);
      output += lastToken;

      return output;
    },
  }
});

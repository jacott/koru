define((require, exports, module) => {
  'use strict';
  const CodeIndentation = require('koru/parse/code-indentation');
  const {parse, visitorKeys} = require('koru/parse/js-ast');
  const JsPrinter       = require('koru/parse/js-printer');
  const {qstr}          = require('koru/util');

  const extraIndent$ = Symbol();

  const SameLineWsOrCommaRE = /(?:,|[^\S\n])+/yg;
  const SpaceRE = / +/yg;
  const WsRE = /\s+/yg;
  const SameLineWsOrSemiRE = /(?:;|[^\S\n])+/yg;

  const allowedKeyRE = /^\d{1,15}$|^[A-Za-z_$][\w$]*$/;

  const isSameEndLine = (p, c) => p.loc.end.line == c.loc.end.line;

  const StringOrComment = {
    __proto__: null,
    comment: true,
    string: true,
    template: true,
  };

  const UnaryAllowedClose = {
    __proto__: null,
    NumericLiteral: true,
    ParenthesizedExpression: true,
    Identifier: true,
    CallExpression: true,
  };

  const isSimpleNode = (isLeft, node, operator) => (
    node.type === 'NumericLiteral') || (
      node.type === 'BinaryExpression' &&
        node.operator === operator &&
        (isLeft ? isSimpleNode(false, node.right, operator) : isSimpleNode(true, node.left, operator)));

  const writeAsync = (self, node) => {
    if (node.async) {
      self.writeAdvance('async');
      self.writeGap();
    }
  };

  class MyPrinter extends JsPrinter {
    advancePrintNode(node) {
      this.skipOver();
      this.print(node);
    }

    noSemiColon() {
      this.lastToken = ';';
    }

    isNoSemiColon() {
      return this.lastToken == ';';
    }

    isSameLine(n) {
      return n.loc.start.line === this.lastLine;
    }

    forceSemiColon() {
      if (! this.lastToken.endsWith(';')) {
        this.write(';');
        this.skipOver();
      }
    }

    writeGap() {
      this.skipOver();
      if (! /[\n;]/.test(this.input[this.inputPoint])) {
        this.write(' ');
      }
    }

    printTest(node) {
      this.writeAdvance('(');
      this.advancePrintNode(node);
      this.writeAdvance(')');
      this.write(' ');
    }

    printParams(params, catchup=true) {
      if (params.length != 0) {
        this.skipOver();
        let p;
        for (const n of params) {
          if (p !== undefined) {
            if ((n?.leadingComments?.length ?? 0) != 0 || (p?.trailingComments?.length ?? 0) != 0) {
              this.writeAdvance(',');
              this.skipOver(SameLineWsOrCommaRE);
            } else {
              this.writeAdvance(',');
              this.skipOver();
              this.writeGapIfNeeded();
              this.skipOverNl(2);
            }
          } else {
            this.skipOverNl(1);
          }
          p = n;
          if (n !== null) {
            this.print(n, true);
            this.catchup(n.end);
          }
        }
        if (p === null) {
          this.writeAdvance(',');
        } else if ((p?.trailingComments?.length ?? 0) != 0) {
          if (p.loc.end.line < p.trailingComments.at(-1).loc.end.line) {
            this.write(',');
          }
          this.skipOver(SameLineWsOrCommaRE);
        } else {
          this.skipOver(SameLineWsOrCommaRE);
          if (catchup && this.isAtNewline()) {
            this.write(',');
            this.skipOverNl(1);
          }
        }
      }
    }

    printBlock(body, parent) {
      if (body.length == 0) return;
      let p = undefined;
      let minIdx = this.inputPoint;
      let last;
      for (let i = body.length - 1; i >= 0; --i) {
        last = body[i];
        if (last.type !== 'EmptyStatement') break;
      }
      if (last === undefined || last.type === 'EmptyStatement') {
        return;
      }

      if (last.loc.end.line === parent?.loc.start.line) {
        for (const n of body) {
          if (n.type !== 'EmptyStatement') {
            if (n !== last) break;
            this.advance(n.start);
            if (n.type === 'ReturnStatement') {
              this.ReturnStatement(n);
              this.noSemiColon();
            } else {
              this.print(n);
            }
            return;
          }
        }
      }

      for (const n of body) {
        if (n.type === 'EmptyStatement') {
          minIdx = n.end;
          continue;
        }
        if (p !== undefined) {
          const noSemi = p.type === 'BlockStatement';
          if (this.isSameLine(n)) {
            noSemi || this.write(';');
            if ((n.leadingComments?.length ?? 0) == 0 && (p.trailingComments?.length ?? 0) == 0) {
              this.write(' ');
            }
            this.skipOver(SameLineWsOrSemiRE);
          } else {
            noSemi || this.write(';');
            const adv = Math.max(this.lastIndexOf('\n', n.start) + 1, minIdx);
            this.skipOver(SameLineWsOrSemiRE);
            if ((n.leadingComments?.length ?? 0) == 0 && (p.trailingComments?.length ?? 0) == 0) {
              this.skipOverNl(2);
            }
            this.advance(adv);
          }
        } else if (! this.isSameLine(n)) {
          this.skipOverNl(1);
        }
        p = n;
        if (n.type === 'ExpressionStatement') {
          this.print(n.expression);
        } else {
          this.print(n);
        }
      }
      const noSemi = this.isNoSemiColon() || p.type === 'BlockStatement';
      if ((p.trailingComments?.length ?? 0) != 0) {
        noSemi || this.write(';');
      } else {
        this.skipOver(SameLineWsOrSemiRE);
        if (this.isAtNewline()) {
          noSemi || this.write(';');
          this.skipOverNl(1);
        }
      }
      this.skipOver(SameLineWsOrSemiRE);
    }

    convertToBlock(node) {
      this.write('{');
      this.write('\n');
      this.advance(node.start);
      this.print(node);
      this.catchup(node.end);
      this.forceSemiColon();
      this.write('\n');
      this.write('}');
    }

    printList(open, close, node, list) {
      this.writeAdvance(open);
      if (list.length != 0) {
        this.printParams(list);
      }
      this.writeAdvance(close);
    }

    printFunction(node) {
      writeAsync(this, node);
      if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
        this.writeAdvance('function');
        this.write(' ');
      } else if (node.kind === 'get' || node.kind === 'set') {
        this.writeAdvance(node.kind);
        this.write(' ');
      }
      if (node.generator) {
        this.writeAdvance('*');
      }

      node.computed && this.writeAdvance('[');

      this.advancePrintNode(node.key ?? node.id);

      node.computed && this.writeAdvance(']');
      this.printList('(', ')', node, node.params);
      this.write(' ');
      this.advance(node.body.start);
      this.print(node.body);
    }

    printBlockOrStatement(body, sameLine) {
      if (body.type === 'BlockStatement' ||
          (body.loc.start.line === sameLine && body.loc.end.line)) {
        this.writeGap();
        this.print(body);
        body.type === 'BlockStatement' && this.noSemiColon();
      } else {
        this.write(' ');
        this.convertToBlock(body);
        this.noSemiColon();
      }
    }

    printForLoop(type, node) {
      this.write('for ');
      node.await && this.write('await ');
      this.write('(');
      this.advance(node.left.start);
      this.print(node.left);
      this.writeGap();
      this.writeAdvance(type);
      this.write(' ');
      this.advance(node.right.start);
      this.print(node.right);
      this.writeAdvance(')');
      this.printBlockOrStatement(node.body, node.right.loc.end.line);
    }

    singleSemicolon() {
      this.write(''); // clear semicolon
      this.writeAdvance(';');
      this.noSemiColon();
    }

    printForNode(node) {
      this.advance(node.start);
      this.print(node);
      this.skipOver();
      this.singleSemicolon();
    }

    printLeftRight(node, operator, spacing=true) {
      this.advance(node.left.start);
      const {indent} = this;
      const isInc = indent.lastDir > 0;
      let indentRight = indent.lineStartPadding;
      this.print(node.left);
      spacing && this.write(' ');
      this.skipOver();
      const newlineBeforeOperator = this.isAtNewline();
      this.writeAdvance(operator);
      this.skipOver();
      if (newlineBeforeOperator || this.isAtNewline()) {
        this.write('\n');
        if (indentRight != indent.lineIndent) {
          indentRight = undefined;
        } else if (++this[extraIndent$] == 1) {
          if (isInc) {
            indent.lineIndent = indentRight;
          } else {
            indent.lineIndent = indentRight + indent.tabWidth;
          }
        }
        if (! newlineBeforeOperator) this.advance(this.inputPoint + 1);
      } else {
        indentRight = undefined;
        spacing && this.write(' ');
      }
      this.advancePrintNode(node.right);
      if (indentRight !== undefined) {
        if (--this[extraIndent$] == 0) indent.lineIndent = indentRight;
      }
    }

    printKeyword(node, keyword) {
      this.write(keyword);
      this.write(' ');
      this.advance(node.argument.start);
      this.print(node.argument);
    }

    printKeywordOption(node, keyword, argument) {
      this.write(keyword);
      if (argument === null) {
        this.advance(node.end);
      } else {
        this.write(' ');
        this.advance(argument.start);
        this.print(argument);
      }
    }

    printObjectKey(key) {
      if (key.type === 'StringLiteral' && allowedKeyRE.test(key.value)) {
        this.catchup(key.start);
        this.write(key.value);
        this.advance(key.end);
      } else {
        this.print(key);
      }
    }

    BreakStatement(node) {this.printKeywordOption(node, 'break', node.label)}
    ContinueStatement(node) {this.printKeywordOption(node, 'continue', node.label)}

    ReturnStatement(node) {
      this.printKeywordOption(node, 'return', node.argument);
    }

    AwaitExpression(node) {this.printKeyword(node, 'await')}

    ThrowStatement(node) {this.printKeyword(node, 'throw')}

    YieldExpression(node) {
      this.printKeyword(node, node.delegate ? 'yield*' : 'yield');
    }

    NewExpression(node) {
      this.write('new');
      this.write(' ');
      this.advance(node.callee.start);
      this.print(node.callee);
      if (node.arguments.length == 0) {
        this.write('(');
        this.write(')');
      } else {
        this.writeAdvance('(');
        if (node.arguments.length != 0) {
          this.printParams(node.arguments);
        }
        this.write(')');
      }
      this.advance(node.end);
    }

    ExpressionStatement(node) {
      this.print(node.expression);
      if (this.input[node.end - 1] === ';') {
        this.skipOver();
        this.advance(this.inputPoint + 1);
      }
    }

    ParenthesizedExpression(node) {
      if (node.expression.type === 'ParenthesizedExpression') {
        this.advance(node.expression.start);
        this.ParenthesizedExpression(node.expression);
        this.advance(node.end);
        return;
      }
      this.writeAdvance('(');
      this.skipOver();
      this.skipOverNl(1);

      this.advance(node.expression.start);
      this.print(node.expression);
      this.writeAdvance(')');
    }

    SequenceExpression(node) {
      this.printParams(node.expressions, false);
      if (this.isAtNewline()) {
        this.skipOverNl(1);
      }
    }

    ArrayExpression(node) {
      this.printList('[', ']', node, node.elements);
    }

    ArrayPattern(node) {
      this.printList('[', ']', node, node.elements);
    }

    UnaryExpression(node) {
      if (node.operator === 'void' && node.argument.type === 'NumericLiteral') {
        this.write('undefined');
        this.advance(node.argument.end);
        return;
      }
      this.writeAdvance(node.operator);
      if (/\w/.test(node.operator.at(-1)) ||
          (node.operator === '!'
           ? (node.argument.type !== 'UnaryExpression' || node.argument.operator !== '!')
           : ! UnaryAllowedClose[node.argument.type])) {
        this.write(' ');
      }
      this.advance(node.argument.start);
      this.advancePrintNode(node.argument);
    }

    LogicalExpression(node) {
      this.printLeftRight(node, node.operator);
    }

    BinaryExpression(node) {
      this.printLeftRight(node, node.operator, node.operator.length != 1 ||
                          node.left.loc.start.line != node.right.loc.end.line ||
                          ! isSimpleNode(true, node.left, node.operator) ||
                          ! isSimpleNode(false, node.right, node.operator));
    }

    AssignmentExpression(node) {
      this.printLeftRight(node, node.operator);
    }

    ObjectPattern(node) {
      this.printList('{', '}', node, node.properties, node.body);
    }

    ObjectExpression(node) {
      this.ObjectPattern(node);
    }

    ObjectProperty(node) {
      if (node.shorthand && node.value.type === 'Identifier') {
        this.print(node.key);
        return;
      }
      if (node.computed) {
        this.writeAdvance('[');
        this.print(node.key);
        this.write(']');
        this.write(': ');
        this.advance(node.value.start);
      }

      switch (node.value.type) {
      case 'Identifier':
        if (node.computed) {
          this.print(node.value);
        } else if (node.key.type === 'Identifier' &&
                   node.key.name === node.value.name) {
          this.advance(node.value.start);
          this.print(node.value);
        } else {
          this.printObjectKey(node.key);
          this.write(': ');
          this.advance(node.value.start);
          this.print(node.value);
        }
        break;
      case 'AssignmentPattern':
        if (! node.shorthand && node.key.name !== node.value.left.name) {
          this.printObjectKey(node.key);
          this.write(': ');
          this.advance(node.value.start);
        }
        this.printLeftRight(node.value, '=', false);
        break;
      default:
        if (! node.computed) {
          this.printObjectKey(node.key);
          this.write(': ');
          this.advance(node.value.start);
        }
        this.print(node.value);
      }
    }

    ObjectMethod(node) {
      this.printFunction(node);
    }

    ClassDeclaration(node) {
      this.writeAdvance('class');
      this.writeGap();
      this.print(node.id);
      this.writeGap();
      if (node.superClass != null) {
        this.writeAdvance('extends');
        this.writeGap();
        this.print(node.superClass);
        this.writeGap();
      }
      this.advance(node.body.start);
      this.print(node.body);
      this.noSemiColon();
    }

    ClassMethod(node) {
      if (node.static) {
        this.writeAdvance('static');
        this.write(' ');
      }
      this.printFunction(node);
      this.noSemiColon();
    }

    FunctionDeclaration(node) {
      this.printFunction(node);
      this.noSemiColon();
    }

    FunctionExpression(node) {
      this.FunctionDeclaration(node);
    }

    ConditionalExpression(node) {
      this.print(node.test);
      this.catchup(node.test.end);
      const prefix = node.test.loc.end.line === node.alternate.loc.start.line ? ' ' : '\n';
      this.write(prefix);
      this.writeAdvance('?');
      this.write(' ');
      this.advance(node.consequent.start);
      this.print(node.consequent);
      this.write(prefix);
      this.writeAdvance(':');
      this.write(' ');
      this.advance(node.alternate.start);
      this.print(node.alternate);
    }

    TryStatement(node) {
      this.write('try ');
      this.BlockStatement(node.block);
      if (node.handler != null) {
        this.write(' ');
        this.advance(node.handler.start);
        this.write('catch ');
        this.write('(');
        this.advance(node.handler.param.start);
        this.print(node.handler.param);
        this.write(')');
        this.write(' ');
        this.BlockStatement(node.handler.body);
      }
      if (node.finalizer != null) {
        this.write(' ');
        this.write('finally ');
        this.BlockStatement(node.finalizer);
      }
      this.noSemiColon();
    }

    SwitchStatement(node) {
      this.write('switch ');
      this.printTest(node.discriminant);
      this.writeAdvance('{');
      for (const c of node.cases) {
        this.print(c);
      }
      this.writeAdvance('}');
      this.noSemiColon();
    }

    ForOfStatement(node) {
      this.printForLoop('of', node);
    }

    ForInStatement(node) {
      this.printForLoop('in', node);
    }

    ForStatement(node) {
      this.write('for ');
      this.write('(');
      if (node.init === null) {
        this.singleSemicolon();
      } else {
        this.printForNode(node.init);
        if (node.test !== null) {
          this.skipOverNl(1) || this.writeGap();
        }
      }

      if (node.test === null) {
        this.singleSemicolon();
      } else {
        this.printForNode(node.test);
        if (node.update !== null) {
          this.skipOverNl(1) || this.writeGap();
        }
      }
      node.update === null || this.print(node.update);
      this.writeAdvance(')');
      this.printBlockOrStatement(node.body, (node.update ?? node.test ?? node.init)?.loc.end.line ?? node.loc.start.line);
    }

    SwitchCase(node) {
      if (node.test == null) {
        this.write('default', 'unindent');
      } else {
        this.write('case ', 'unindent');
        this.advance(node.test.start);
        this.print(node.test);
      }
      this.writeAdvance(':');
      this.printBlock(node.consequent);
    }

    IfStatement(node) {
      this.write('if ');
      this.printTest(node.test);
      if (node.consequent.type === 'BlockStatement') {
        if (node.consequent.body.length == 0) {
          this.writeAdvance('{');
          this.skipOverNl(1);
          this.writeAdvance('}');
        } else {
          this.advancePrintNode(node.consequent);
        }
      } else if (node.alternate === null && node.consequent.loc.start.line === node.test.loc.end.line) {
        this.advancePrintNode(node.consequent);
        return;
      } else {
        this.convertToBlock(node.consequent);
      }
      if (node.alternate !== null) {
        this.write(' ');
        this.writeAdvance('else');
        this.write(' ');
        switch (node.alternate.type) {
        case 'BlockStatement':
          this.advancePrintNode(node.alternate);
          break;
        case 'IfStatement':
          this.advancePrintNode(node.alternate);
          break;
        default:
          this.convertToBlock(node.alternate);
          this.advance(node.end);
          this.skipOver(SameLineWsOrSemiRE);
        }
      }
      this.noSemiColon();
    }

    WhileStatement(node) {
      this.write('while ');
      this.printTest(node.test);
      if (node.body.type === 'BlockStatement' ||
          node.body.loc.start.line === node.test.loc.end.line) {
        this.advancePrintNode(node.body);
        if (node.body.type === 'BlockStatement') {
          this.noSemiColon();
        }
      } else {
        this.convertToBlock(node.body);
        this.noSemiColon();
      }
    }

    DoWhileStatement(node) {
      if (node.body.type === 'BlockStatement') {
        this.write('do ');
        this.BlockStatement(node.body);
        this.write(' while ');
      } else {
        this.write('do ');
        this.advance(node.body.start);
        this.print(node.body);
        this.catchup(node.body.end);
        this.write('; while ');
      }
      this.printTest(node.test);
      this.advance(node.end);
      this.noSemiColon();
    }

    LabeledStatement(node) {
      this.write(node.label.name);
      this.write(': ');
      this.advance(node.body.start);
      this.print(node.body);
    }

    VariableDeclaration(node) {
      this.writeAdvance(node.kind);
      this.skipOverNl(1) || this.writeGap();
      this.printParams(node.declarations, false);
      this.catchup(node.end);
      this.skipOver();
      if (! this.lastToken.endsWith(';') && /[^\S;]/.test(this.input[this.inputPoint])) {
        this.forceSemiColon();
      }
    }

    VariableDeclarator(node) {
      this.print(node.id);
      if (node.init !== null) {
        this.write(' = ');
        this.advance(node.init.start);
        this.print(node.init);
      }
    }

    CallExpression(node) {
      this.print(node.callee);
      this.writeAdvance('(');
      if (node.arguments.length != 0) {
        this.printParams(node.arguments);
      }
      this.write(')');
      this.advance(node.end);
    }

    EmptyStatement(node) {
      this.advance(node.end);
    }

    StringLiteral(node) {
      const raw = node.extra.raw;
      this.write(raw?.[0] === "'" ? raw : qstr(node.value), 'string');
      this.advance(node.end);
    }

    TemplateLiteral(node) {
      const {quasis, expressions} = node;
      this.advance(quasis[0].start);
      this.write('`');
      this.write(quasis[0].value.raw, 'template');
      this.advance(quasis[0].end);
      for (let i = 0; i < expressions.length; ++i) {
        this.writeAdvance('${', 'template');
        this.print(expressions[i]);
        this.write('}', 'template');
        const q = quasis[i + 1];
        this.write(q.value.raw, 'template');
        this.advance(quasis[i].end);
      }

      this.write('`');
      this.advance(node.end);
    }

    TemplateElement(node) {
      throw new Error('Should not get here');
    }

    ArrowFunctionExpression(node) {
      writeAsync(this, node);
      this.skipOver();
      if (this.input[this.inputPoint] === '(') {
        this.printList('(', ')', node, node.params);
      } else {
        this.write('(');
        this.printParams(node.params);
        this.write(')');
      }
      this.write(' ');
      this.writeAdvance('=>');
      if (node.body.type === 'BlockStatement') {
        this.write(' ');
        this.BlockStatement(node.body);
      } else {
        this.writeGap();
        this.print(node.body);
      }
    }

    Program(node) {
      this.printBlock(node.body);
    }

    ClassBody(node) {
      this.BlockStatement(node);
    }

    BlockStatement(node) {
      this.writeAdvance('{');
      this.printBlock(node.body, node);
      this.writeAdvance('}');
    }
  }

  const convertErrors = (errors) => errors.map((e) => ({reason: e.toString(), start: e.pos}));

  return {
    reformat: (input, {initialIndent=-1, tabWidth=2}={}) => {
      let ast;
      try {
        ast = parse(input);
      } catch (err) {
        if (err.name !== 'SyntaxError') throw err;
        return {errors: convertErrors([err])};
      }

      if (ast.errors.length != 0) return {errors: convertErrors(ast.errors)};

      let pt = '';

      const write = (token, type) => {
        pt = printer.lastToken;
        if (StringOrComment[type] === undefined) {
          printer.lastToken = token;
          if (token === ';' && pt.endsWith(';')) return;
        }
        if (indent.line === '' && type !== 'suppress' &&
            (token === '\n' ||
             ((token = token.trimLeft()) === ''))) {
          printer.lastToken = pt;
          if (token === '\n') indent.write(token);
          return;
        }

        if (type === 'comment') {
          indent.appendComment(token.replace(/^\n[^\S\n]*\n[^/]*\n([^\S\n]*\/)/, '\n\n$1'));
        } else {
          indent.append(token, type);
        }
      };

      const printer = new MyPrinter({input, write});
      if (initialIndent < 0) {
        initialIndent = printer.nextStopPoint(true);
      }
      const indent = new CodeIndentation({initialIndent, tabWidth});
      printer.indent = indent;
      printer[extraIndent$] = 0;

      printer.print(ast);
      printer.catchup(ast.end);

      return {source: indent.complete()};
    },
  };
});

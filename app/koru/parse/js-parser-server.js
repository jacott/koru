define((require)=> JsPaser => {
  'use strict';
  const koru            = require('koru');
  const htmlDoc         = require('koru/dom/html-doc');
  const util            = require('koru/util');

  const {parse, walk, walkArray} = requirejs.nodeRequire('./js-parse-walker');

  const n2c = (node, code)=>{koru.info(node.type+ ": "+ code.slice(node.start, node.end))};

  const ASYNC_WRAPPER_START = "async ()=>{";

  JsPaser.HL_MAP = {
    string: 's',
    number: 'm',
    boolean: 'kc',
  };

  JsPaser.parse = (codeIn, opts={})=> {
    return parse(codeIn, opts);
  };

  const parseOpts = {
    allowImportExportEverywhere: true, allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true, allowSuperOutsideMethod: true,
    allowUndeclaredExports: true,
  };

  JsPaser.highlight = (codeIn, tag='div')=>{
    if (! codeIn) return;

    let srcPos = 0;
    let identType = 'nx';

    const ast = JsPaser.parse(codeIn, parseOpts);
    const {comments} = ast;
    let commentIndex = 0;

    const div = document.createElement(tag);
    div.className = 'highlight';

    const addSpan = (spos, epos, hl)=>{
      const span = document.createElement('span');
      span.className = hl;
      span.textContent = codeIn.slice(spos, epos);
      div.appendChild(span);
      srcPos = epos;
    };

    const catchup = pos=>{
      if (srcPos >= pos) return;
      while (commentIndex < comments.length) {
        const c = comments[commentIndex];
        if (c.start > pos) break;
        if (c.start > srcPos) {
          div.appendChild(document.createTextNode(codeIn.slice(srcPos, c.start)));
        }
        addSpan(c.start, c.end, c.type === 'CommentLine' ? 'cs' : 'cm');
        ++commentIndex;
      }
      div.appendChild(document.createTextNode(codeIn.slice(srcPos, pos)));
      srcPos = pos;
    };

    const addRange = (spos, epos, hl)=>{
      if (srcPos > spos) return;
      catchup(spos);
      addSpan(spos, epos, hl);
    };

    const addText = (text, start, hl)=>{
      const spos = codeIn.indexOf(text, Math.max(srcPos, start));
      addRange(spos, spos+text.length, hl);
    };

    const addHl = (node, hl)=>{
      addRange(node.start, node.end, hl);
    };

    const binaryExpr = (node)=>{
      expr(node.left);
      addText(node.operator, node.left.end, 'o');
      expr(node.right);
    };

    const expr = node=>{
      if (node == null) return;
      if (Array.isArray(node)) {
        node.forEach(expr);
      } else {
        visitor(node);
      }
    };

    const typeExpr = (node, type)=>{
      const cType = identType;
      identType = type;
      expr(node);
      identType = cType;
    };

    const addAsync = (node)=>{
      node.async && addText('async', node.start, 'k');
    };

    const addParam = (node, hl) => {
      switch(node.type) {
      case 'ObjectPattern':
        for (const p of node.properties) {
          if (p.shorthand) {
            addHl(p.key, hl);
            if (p.value.type === 'AssignmentPattern')
              typeExpr(p.value, 'nx');
          } else {
            typeExpr(p.key, 'na');
            addParam(p.value, hl);
          }
        }
        break;
      case 'ArrayPattern':
        for (const p of node.elements) {
          addParam(p, hl);
        }
        break;
      case 'VariableDeclarator':
        addParam(node.id, hl);
        if (node.init != null) {
          addText('=', node.id.end, 'o');
          expr(node.init);
        }
        break;
      case 'AssignmentPattern':
        addParam(node.left, 'nv');
        addText('=', node.left.end, 'o');
        expr(node.right);
        break;
      default:
        typeExpr(node, hl);
      }
    };

    const addParams = (params, hl='nv') => {
      for (const param of params) {
        addParam(param, hl);
      }
    };

    const functionExpression = (node)=>{
      addAsync(node);
      addText('function', node.start, 'kd');
      expr(node.name);
      expr(node.argnames);
      expr(node.body);
    };

    const addKey = (node, type='na')=>{
      if (node.key.type === 'Identifier') {
        addIdent(node.key, 'na');
      } else {
        expr(node.key);
      }
      return node.shorthand;
    };

    const ClassDeclaration = (node)=>{
        addText('class', node.start, 'k');
        typeExpr(node.id, 'nc');
        if (node.superClass) {
          addText('extends', srcPos, 'k');
          expr(node.superClass);
        }
        expr(node.body);
    };

    const addIdent = (node, hl=identType) => {
      addHl(node, WELLKNOWN[node.name] || hl);
    };

    const WELLKNOWN = {
      NaN: 'm',
      Infinity: 'm',
      undefined: 'kc',
      constructor: undefined,
    };

    const TYPES = {
      BooleanLiteral: 'kc',
      NullLiteral: 'kc',
      NumericLiteral: 'm',
      BigIntLiteral: 'm',
      StringLiteral: 's',
      RegExpLiteral: 'sr',
      Super: 'k',
      ThisExpression: 'k',
      SpreadElement(node) {
        addText('...', node.start, 'k');
        expr(node.argument);
      },
      MemberExpression(node) {
        typeExpr(node.object, 'nx');
        typeExpr(node.property, 'na');
      },
      ObjectMethod(node) {
        if (node.kind !== 'method') {
          addText(node.kind, node.start, 'k');
        }
        typeExpr(node.key, 'nf');
        typeExpr(node.params, 'nv');
        expr(node.body);
      },
      ClassMethod(node) {
        if (node.static) {
          addText('static', node.start, 'kt');
        }
        addAsync(node);
        if (node.kind === 'constructor') {
          addText('constructor', node.start, 'k');
        } else {
          typeExpr(node.key, 'nf');
        }
        typeExpr(node.params, 'nv');
        expr(node.body);
      },
      AssignmentPattern(node) {
        expr(node.left);
        addText('=', node.start, 'o');
        expr(node.right);
      },
      AssignmentExpression: binaryExpr,
      BinaryExpression: binaryExpr,

      TemplateLiteral(node) {
        let pos = node.start;
        for (const ex of node.expressions) {
          addRange(pos, ex.start, 's');
          expr(ex);
          pos = ex.end;
        }
        addRange(pos, node.end, 's');
      },
      BreakStatement(node) {
        addText('break', node.start, 'k');
        typeExpr(node.label, 'nl');
      },
      ContinueStatement(node) {
        addText('continue', node.start, 'k');
        typeExpr(node.label, 'nl');
      },
      ReturnStatement(node) {
        addText('return', node.start, 'k');
        expr(node.argument);
      },
      LogicalExpression: binaryExpr,

      ArrowFunctionExpression(node) {
        addAsync(node);
        addParams(node.params);
        addText('=>', srcPos, 'o');
        expr(node.body);
      },
      FunctionExpression(node) {
        addAsync(node);
        addText('function', srcPos, 'kd');
        addParams(node.params, 'nv');
        expr(node.body);
      },
      ConditionalExpression(node) {
        expr(node.test);
        addText('?', srcPos, 'o');
        expr(node.consequent);
        addText(':', srcPos, 'o');
        expr(node.alternate);
      },
      ClassDeclaration,
      ClassExpression: ClassDeclaration,
      FunctionDeclaration(node) {
        addText('function', node.start, 'kd');
        addHl(node.id, 'nf');
        addParams(node.params);
        expr(node.body);
      },
      ObjectProperty(node) {
        const {value} = node;
        if (value.type === 'DefaultAssign' && value.left.name === node.key) {
          addText(node.key, node.start, 'nv');
          addText('=', srcPos, 'o');
          expr(value.right);
        } else if (!addKey(node)) {
          if (value.type === 'DefaultAssign' && value.left.type === 'SymbolFunarg') {
            addText(value.left.name, value.left.start, 'nv');
            addText('=', srcPos, 'o');
            expr(value.right);
          } else
            expr(value);
        }
      },
      AwaitExpression(node) {
        addText('await', srcPos, 'k');
        expr(node.argument);
      },
      YieldExpression(node) {
        addText('yield', srcPos, 'k');
        expr(node.argument);
      },
      UpdateExpression(node) {
        if (node.prefix) {
          addText(node.operator, node.start, 'o');
          expr(node.argument);
        } else {
          expr(node.argument);
          addText(node.operator, node.start, 'o');
        }
      },
      UnaryExpression(node) {
        addText(node.operator, node.start, 'o');
        expr(node.argument);
      },
      SwitchStatement(node) {
        addText('switch', node.start, 'k');
        expr(node.discriminant);
        expr(node.cases);
      },
      SwitchCase(node) {
        if (node.test !== null) {
          addText('case', node.start, 'k');
          expr(node.test);
        } else {
          addText('default', node.start, 'k');
        }
        expr(node.consequent);
      },
      TryStatement(node) {
        addText('try', node.start, 'k');
        expr(node.block);
        expr(node.handler);
        if (node.finalizer != null) {
          addText('finally', srcPos, 'k');
          expr(node.finalizer);
        }
      },
      ThrowStatement(node) {
        addText('throw', node.start, 'k');
        expr(node.argument);
      },
      CatchClause(node) {
        addText('catch', node.start, 'k');
        addHl(node.param, 'nv');
        expr(node.body);
      },
      NewExpression(node) {
        addText('new', node.start, 'k');
        typeExpr(node.callee, 'nx');
        expr(node.arguments);
      },
      DoWhileStatement(node) {
        addText('do', node.start, 'k');
        expr(node.body);
        addText('while', srcPos, 'k');
        expr(node.test);
      },

      LabeledStatement(node) {
        typeExpr(node.label, 'nl');
        expr(node.body);
      },
      WhileStatement(node) {
        addText('while', node.start, 'k');
        expr(node.test);
        expr(node.body);
      },
      ForOfStatement(node) {
        addText('for', node.start, 'k');
        if (node.await) addText('await', srcPos, 'k');
        expr(node.left);
        addText('of', srcPos, 'k');
        expr(node.right);
        expr(node.body);
      },
      ForStatement(node) {
        addText('for', node.start, 'k');
        expr(node.init);
        expr(node.test);
        expr(node.update);
        expr(node.body);
      },
      ForInStatement(node) {
        addText('for', node.start, 'k');
        expr(node.left);
        addText('in', srcPos, 'k');
        expr(node.right);
        expr(node.body);
      },
      IfStatement(node) {
        addText('if', node.start, 'k');
        expr(node.test);
        expr(node.consequent);
        if (node.alternate != null) {
          addText('else', srcPos, 'k');
          expr(node.alternate);
        }
      },

      Identifier(node) {
        addIdent(node, identType);
      },

      VariableDeclaration(node) {
        addText(node.kind, node.start, 'kd');

        addParams(node.declarations, node.kind === 'const' ? 'no' : 'nv');
      }
    };

    const visitor = node =>{
      const hl = TYPES[node.type];
      switch (typeof hl) {
      case 'string': addHl(node, hl); break;
      case 'function': hl(node); break;
      default:
        walk(node, visitor);
      }

      return 2;
    };

    walk(ast, visitor);

    catchup(codeIn.length);

    return div;
  };

  {
    const tryParse = (iter)=>{
      let ex1;
      for (let code of iter) {
        try {
          return JsPaser.parse(code, parseOpts);
        } catch(ex) {
          if (ex.name !== 'SyntaxError')
            throw ex;
          ex1 = ex;
        }
      }
      throw ex1;
    };

    JsPaser.extractParams = (code)=>{
      code = code.trim();
      const orig = code;
      if (! code.endsWith("}"))
        code += "{}";
      let sig = code.replace(/^function\b\s*/, 'x');

      sig = `1|{${sig}}`;

      let ast;
      try {
        ast = tryParse(function*() {
          yield sig;
          yield sig = code;
          yield sig = `1|{x${code}}`;
          yield sig = orig;
        }());
      } catch(ex) {
        const msg = `Error parsing ${sig}`;
        if (ex.name === 'SyntaxError')
          throw new SyntaxError(`${msg}:\n${ex}`);
        koru.error(msg);
        throw ex;
      }
      const args = [];

      const extractItem = (n)=>{extract(n)};

      const extract = (node) => {
        switch(node.type) {
        case 'ArrayPattern':
          args.push('{');
          walkArray(node.elements, extractItem);
          args.push('}');
          return 0;
        case 'AssignmentPattern':
          extract(node.left);
          return 0;
        case 'Identifier':
          args.push(node.name);
          return 0;
        case 'ObjectProperty':
          extract(node.value);
          return 2;

        case 'ObjectPattern':
          args.push('{');
          walkArray(node.properties, extract);
          args.push('}');
          return 0;
        }
        return 1;
      };

      const visitor = (node) => {
        if (node.params != null) {
          for (const n of node.params) {
            walk({n}, extract);
          }
          return 0;
        }
        return 1;
      };

      walk(ast, visitor);

      return args;
    };
  }

  return JsPaser;
});

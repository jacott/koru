define(function(require, exports, module) {
  const koru           = require('koru');
  const htmlDoc        = require('koru/dom/html-doc');
  const util           = require('koru/util');
  const generate       = requirejs.nodeRequire('babel-generator').default;
  const {VISITOR_KEYS} = requirejs.nodeRequire('babel-types/lib/definitions');
  const {parse}        = requirejs.nodeRequire('babylon');

  const HL_MAP = {
    string: 's',
    number: 'm',
    boolean: 'kc',
  };

  function funcBody(func) {
    const code = func.toString();
    return code.slice(code.indexOf('\n')+1, code.lastIndexOf('\n'));
  }

  function highlight(codeIn) {
    if (! codeIn) return;

    let srcPos = 0;
    var ast = parse(codeIn);
    codeIn = generate(ast, {
      comments: true,
      compact: false,
      sourceMaps: false,
    }, []).code;

    var ast = parse(codeIn);

    const div = document.createElement('div');
    div.className = 'highlight';

    function binaryExpr(node) {
      expr(node.left);
      addHlString(node.operator, node.left.end, 'o');
      expr(node.right);
    }

    function unknown(node) {
      koru.error(`Unexpected node ${node.type} parsing javascript`);
    }

    function FunctionExpression(node) {
      addHlString('function', node.start, 'kd');
      expr(node.id);
      expr(node.params);
      expr(node.body);
    }

    const TYPES = {
      BooleanLiteral: 'kc',
      Identifier: 'nx',
      NullLiteral: 'kc',
      NumericLiteral: 'm',
      StringLiteral: 's',
      Super: 'k',
      ThisExpression: 'k',
      BinaryExpression: binaryExpr,
      CallExpression(node) {
        expr(node.callee);
        expr(node.arguments);
      },
      FunctionDeclaration: FunctionExpression,
      ArrayExpression(node) {
        expr(node.elements);
      },
      ArrayPattern(node) {
        expr(node.elements);
      },
      ArrowFunctionExpression(node) {
        expr(node.params);
        addHlString('=>', srcPos, 'o');
        expr(node.body);
      },
      AssignmentExpression: binaryExpr,
      // Directive(node) {},
      // DirectiveLiteral(node) {},
      BlockStatement(node) {
        expr(node.directives);
        expr(node.body);
      },
      // BreakStatement(node) {},
      // CatchClause(node) {},
      ClassBody(node) {
        expr(node.body);
      },
      ClassDeclaration(node) {
        addHlString('class', node.start, 'k');
        expr(node.id, 'nx');
        if (node.superClass) {
          addHlString('extends', srcPos, 'k');
          expr(node.superClass);
        }
        expr(node.body);
      },
      ClassMethod(node) {
        node.static && addHlString('static', node.start, 'k');
        TYPES.ObjectMethod(node);
      },
      // ConditionalExpression(node) {},
      // ContinueStatement(node) {},
      // DebuggerStatement(node) {},
      // DoWhileStatement(node) {},
      EmptyStatement(node) {},
      ExpressionStatement(node) {
        expr(node.expression);
      },
      // File(node) {},
      // ForInStatement(node) {},
      // ForStatement(node) {},
      FunctionExpression,
      // IfStatement(node) {},
      // LabeledStatement(node) {},
      // RegExpLiteral(node) {},
      // LogicalExpression(node) {},
      MemberExpression(node) {
        expr(node.object);
        expr(node.property, ! node.computed && 'na');
      },
      NewExpression(node) {
        addHlString('new', node.start, 'k');
        expr(node.callee);
        expr(node.arguments);
      },
      // Program(node) {},
      ObjectExpression(node) {
        expr(node.properties);
      },
      ObjectMethod(node) {
        if (node.kind !== 'method')
          addHlString(node.kind, node.start, 'k');
        expr(node.key, 'nf');
        expr(node.params);
        expr(node.body);
      },
      ObjectPattern(node) {
        expr(node.properties);
        expr(node.decorators);
      },
      ObjectProperty(node) {
        const {key, value} = node;
        const shorthand = node.extra && node.extra.shorthand;
        expr(key, shorthand ? 'nx' : 'na');
        shorthand || expr(value);
      },
      // RestElement(node) {},
      ReturnStatement(node) {
        addHlString('return', node.start, 'k');
        expr(node.argument);
      },
      // SequenceExpression(node) {},
      SpreadElement(node) {
        addHlString('...', node.start, 'k');
        expr(node.argument);
      },
      // SwitchCase(node) {},
      // SwitchStatement(node) {},
      // ThrowStatement(node) {},
      // TryStatement(node) {},
      UnaryExpression(node) {
        node.prefix || expr(node.argument);
        addHlString(node.operator, node.start, 'o');
        node.prefix && expr(node.argument);
      },
      // UpdateExpression(node) {},
      VariableDeclaration(node) {
        addHlString(node.kind, node.start, 'kd');
        expr(node.declarations);
      },
      VariableDeclarator(node) {
        expr(node.id);
        expr(node.init);
      },
      // WhileStatement(node) {},
      // WithStatement(node) {},
    };

    function expr(node, idkw) {
      if (! node) return;
      if (Array.isArray(node)) {
        node.forEach(n => expr(n, idkw));
        return;
      }
      leadingComments(node);
      const hl = TYPES[node.type];
      switch (typeof hl) {
      case 'string': addHl(node, idkw || hl); break;
      case 'function': hl(node); break;
      default: unknown(node);
      }
      trailingComments(node);
    }

    function addHlString(text, start, hl) {
      const node = {start: codeIn.indexOf(text, start), end: 0};
      node.end = node.start+text.length;
      addHl(node, hl);
    }

    function addHl(node, hl) {
      addWhitespace(node);
      const span = document.createElement('span');
      span.className = hl;
      span.textContent = codeIn.slice(node.start, node.end);
      srcPos = node.end;
      div.appendChild(span);
    }

    function leadingComments(node) {
      node.leadingComments && addComments(node.leadingComments);
    }

    function trailingComments(node) {
      node.trailingComments && addComments(node.trailingComments);
    }

    function addComments(comments) {
      comments.forEach(node => {
        if (node.start < srcPos) return;

        addHl(node, node.type === 'CommentBlock' ? 'cm' : 'cs');
      });
    }

    function addWhitespace(node) {
      if (srcPos > node.end) return;
      const text = codeIn.slice(srcPos, node.start);
      srcPos = node.end;
      if (! text) return;
      div.appendChild(document.createTextNode(text));
    }

    expr(ast.program.body);

    addWhitespace({start: ast.program.end});

    return div;

    function nodeCode(node) {
      return codeIn.slice(node.start, node.end);
    }
  }

  function nodeKeys(node) {
    return util.diff(Object.keys(node), ['type', 'start', 'end', 'loc', 'sourceType']);
  }

  function findFirstType(type, node) {
    if (! node) return;
    if (Array.isArray(node)) {
      for(let n of node) {
        if (n = findFirstType(type, n))
          return n;
      }
    }
    if (node.type === type) {
      return node;
    } else for(const key of VISITOR_KEYS[node.type]) {
      let n = findFirstType(type, node[key]);
      if (n)
        return n;
    }
  }

  function extractParams(sig, entryType='ObjectMethod') {
    try {
      var ast = parse(sig);
    } catch(ex) {
      const msg = `Error parsing ${sig}`;
      if (ex.name === 'SyntaxError')
        throw new Error(`${msg}:\n${ex}`);
      koru.error(msg);
      throw ex;
    }
    let args = [];

    const node = findFirstType(entryType, ast.program.body);

    expr(node.params, true);

    return args;

    function expr(node, param) {
      if (! node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(n => expr(n, param));
        return;
      }

      switch(node.type) {
      case 'RestElement':
        expr(node.argument, param);
        break;

      case 'Identifier':
        param && args.push(node.name);
        break;

      case 'AssignmentPattern':
        expr(node.left, param);
        break;

      case 'ArrayPattern':
        expr(node.elements, true);
        break;

      case 'ObjectProperty':
        expr(node.value, true);
        break;

      default:
        VISITOR_KEYS[node.type].forEach(key => {
          const sub = node[key];
          sub && expr(sub);
        });
      }
    }
  }

  module.exports = {highlight, funcBody, HL_MAP, extractParams};
});

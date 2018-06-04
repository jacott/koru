define((require, exports, module)=> JsPaser => {
  const koru           = require('koru');
  const htmlDoc        = require('koru/dom/html-doc');
  const util           = require('koru/util');
  const generate       = requirejs.nodeRequire('babel-generator').default;
  const {VISITOR_KEYS} = requirejs.nodeRequire('babel-types/lib/definitions');
  const {parse}        = requirejs.nodeRequire('babylon');

  const {extractCallSignature, findMatch} = JsPaser;

  JsPaser.HL_MAP = {
    string: 's',
    number: 'm',
    boolean: 'kc',
  };

  JsPaser.funcBody = func =>{
    const code = func.toString();
    return code.slice(code.indexOf('\n')+1, code.lastIndexOf('\n'));
  };

  JsPaser.highlight = (codeIn, tag='div')=>{
    if (! codeIn) return;

    let srcPos = 0;
    let ast;
    try {
      ast = parse(codeIn);
    } catch(ex) {
      const msg = `Error parsing ${codeIn}`;
      if (ex.name === 'SyntaxError')
        throw new Error(`${msg}:\n${ex}`);
      koru.error(msg);
      throw ex;
    }
    codeIn = generate(ast, {
      comments: true,
      compact: false,
      sourceMaps: false,
    }, []).code;

    ast = parse(codeIn);

    const div = document.createElement(tag);
    div.className = 'highlight';

    const binaryExpr = (node)=>{
      expr(node.left);
      addHlString(node.operator, node.left.end, 'o');
      expr(node.right);
    };

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
      FunctionDeclaration: FunctionExpression,
      ArrowFunctionExpression(node) {
        expr(node.params);
        addHlString('=>', srcPos, 'o');
        expr(node.body);
      },
      AssignmentExpression: binaryExpr,
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
      ClassExpression(node) {
        addHlString('class', node.start, 'k');
        if (node.superClass) {
          addHlString('extends', srcPos, 'k');
          expr(node.superClass);
        }
        expr(node.body);
      },
      FunctionExpression,
      MemberExpression(node) {
        expr(node.object);
        expr(node.property, ! node.computed && 'na');
      },
      NewExpression(node) {
        addHlString('new', node.start, 'k');
        expr(node.callee);
        expr(node.arguments);
      },
      ObjectMethod(node) {
        if (node.kind !== 'method')
          addHlString(node.kind, node.start, 'k');
        node.kind === 'constructor' ||
          expr(node.key, 'nf');
        expr(node.params);
        expr(node.body);
      },
      ObjectProperty(node) {
        const {key, value} = node;
        const shorthand = node.extra && node.extra.shorthand;
        expr(key, shorthand ? 'nx' : 'na');
        shorthand || expr(value);
      },
      ReturnStatement(node) {
        addHlString('return', node.start, 'k');
        expr(node.argument);
      },
      SpreadElement(node) {
        addHlString('...', node.start, 'k');
        expr(node.argument);
      },
      UnaryExpression(node) {
        node.prefix || expr(node.argument);
        addHlString(node.operator, node.start, 'o');
        node.prefix && expr(node.argument);
      },
      VariableDeclaration(node) {
        addHlString(node.kind, node.start, 'kd');
        expr(node.declarations);
      },
    };

    const expr = (node, idkw)=>{
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
      default:
        VISITOR_KEYS[node.type].forEach(key => {
          const sub = node[key];
          sub && expr(sub);
        });
      }
      trailingComments(node);

    };

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
  };

  function nodeKeys(node) {
    return util.diff(Object.keys(node), ['type', 'start', 'end', 'loc', 'sourceType']);
  }

  function findFirstType(types, node) {
    if (! node) return;
    if (Array.isArray(node)) {
      for(let n of node) {
        if (n = findFirstType(types, n))
          return n;
      }
    }
    if (types[node.type]) {
      return node;

    } else {
      const iter = VISITOR_KEYS[node.type];
      if (! iter)
        return;
      for(let key of iter) {
        let n = findFirstType(types, node[key]);
        if (n)
          return n;
      }
    }
  }

  function tryParse(iter) {
    let ex1;
    for (let code of iter) {
      try {
        return parse(code);
      } catch(ex) {
        if (ex.name !== 'SyntaxError')
          throw ex;
        ex1 = ex1 || ex;
      }
    }
    throw ex1;
  }

  JsPaser.extractParams = (code, entryTypes)=>{
    entryTypes = entryTypes || {
      ObjectMethod: true,
      ArrowFunctionExpression: true,
    };
    code = code.trim();
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
      }());
    } catch(ex) {
      const msg = `Error parsing ${sig}`;
      if (ex.name === 'SyntaxError')
        throw new Error(`${msg}:\n${ex}`);
      koru.error(msg);
      throw ex;
    }
    const args = [];

    const node = findFirstType(entryTypes, ast.program.body);

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
  };

  const NEST_RE = {};
  const PAIR = {};
  '[] {} ()'.split(' ').forEach(pair => {
    PAIR[pair[0]] = pair[1];
    NEST_RE[pair[0]] = new RegExp(`[^/[\`"'{(\\${pair[1]}]*.`, 'g');
  });

  const SKIP_EOL = /[^\n]*/g;
  const SKIP_MLC = /[\s\S]*\*\//g;

  const STRING = {};
  ['`', '"', "'"].forEach(q => {
    STRING[q] = new RegExp(`[^\\\\${q}]*.`, 'g');
  });

  function findStringEnd(code, idx, lookFor) {
    let m, re = STRING[lookFor];
    re.lastIndex = idx;

    while (m = re.exec(code)) {
      let pos, found = code.charAt(re.lastIndex-1);
      if (found === lookFor)
        return re.lastIndex;

      re.lastIndex++;
    }

    return -1;
  }

  return JsPaser;
});

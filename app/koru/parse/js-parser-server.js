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
    try {
      var ast = parse(codeIn);
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

    var ast = parse(codeIn);

    const div = document.createElement('div');
    div.className = 'highlight';

    function binaryExpr(node) {
      expr(node.left);
      addHlString(node.operator, node.left.end, 'o');
      expr(node.right);
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
      default:
        VISITOR_KEYS[node.type].forEach(key => {
          const sub = node[key];
          sub && expr(sub);
        });
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
    } else for(let key of VISITOR_KEYS[node.type]) {
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

  function extractCallSignature(func) {
    let m, code = func.toString();


    if (m = /^(?:class[^{]*\{[\s\S]*(?=constructor\b)|function\s*(?=\w))/.exec(code))
      code = code.slice(m[0].length);
    else if (m = /^(\w+)\s*=>/.exec(code))
      return m[1] += ' => {/*...*/}';

    if (code.startsWith('class'))
      return "constructor()";

    m = /^[^(]*\(/.exec(code);

    let pos = m ? findMatch(code, m[0].length, '(') : -1;

    if (pos === -1)
      throw new Error("Can't find signature of "+code);

    return code.slice(0, pos);
  }

  const NEST_RE = {};
  const PAIR = {};
  '[] {} ()'.split(' ').forEach(pair => {
    PAIR[pair[0]] = pair[1];
    NEST_RE[pair[0]] = new RegExp(`[^/[\`"'{(\\${pair[1]}]*.`, 'g');
  });

  const SKIP_EOL = /[^\n]*/g;
  const SKIP_MLC = /[\s\S]*\*\//g;

  function findMatch(code, idx, lookFor) {
    const endChar = PAIR[lookFor];
    let m, re = NEST_RE[lookFor];
    re.lastIndex = idx;


    while (m = re.exec(code)) {
      let pos, found = code.charAt(re.lastIndex-1);

      switch (found) {
      case endChar:
        return re.lastIndex;
      case '`': case "'": case '"':
        pos = findStringEnd(code, re.lastIndex, found);
        break;
      case '/':
        switch (code.charAt(re.lastIndex)) {
        case '/':
          SKIP_EOL.lastIndex = re.lastIndex;
          if (! SKIP_EOL.exec(code))
            return -1;
          re.lastIndex = SKIP_EOL.lastIndex;
          continue;
        case '*':
          SKIP_MLC.lastIndex = re.lastIndex;
          if (! SKIP_MLC.exec(code))
            return -1;
          re.lastIndex = SKIP_MLC.lastIndex;
          continue;
        }
        return -1;
      default:
        pos = findMatch(code, re.lastIndex, found);
      }
      if (pos === -1) return -1;

      re.lastIndex=pos;
    }
  }

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



  module.exports = {highlight, funcBody, HL_MAP, extractParams};
});

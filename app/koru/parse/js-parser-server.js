define((require, exports, module)=> JsPaser => {
  const koru            = require('koru');
  const htmlDoc         = require('koru/dom/html-doc');
  const util            = require('koru/util');
  const terser          = requirejs.nodeRequire('terser');

  const n2c = (node, code)=> code.slice(node.start.pos, node.end.endpos);

  JsPaser.HL_MAP = {
    string: 's',
    number: 'm',
    boolean: 'kc',
  };

  JsPaser.parse = terser.minify;

  JsPaser.highlight = (codeIn, tag='div')=>{
    if (! codeIn) return;

    let srcPos = 0;

    const {ast, error} = terser.minify(codeIn, {
      parse: {},
      compress: false,
      mangle: false,
      output: {
        comments: 'all',
        ecma: 6,
        ast: true,
      }
    });
    if (error !== undefined)
      throw error;

    const div = document.createElement(tag);
    div.className = 'highlight';

    const leadingComments = (node)=>{
      node.start && addComments(node.start.comments_before);
    };

    const trailingComments = (node)=>{
      node.end && addComments(node.end.comments_after);
    };

    const addComments = (comments)=>{
      comments.forEach(node => {
        if (node.pos < srcPos) return;
        addRange(node.pos, node.endpos,
              node.type === 'comment2' ? 'cm' : 'cs');
      });
    };

    const catchup = pos=>{
      if (! (srcPos < pos)) return;
      const text = codeIn.slice(srcPos, pos);
      srcPos += text.length;
      div.appendChild(document.createTextNode(text));
    };

    const addRange = (spos, epos, hl)=>{
      if (srcPos >spos) return;
      catchup(spos);
      const span = document.createElement('span');
      span.className = hl;
      span.textContent = codeIn.slice(spos, epos);
      srcPos = epos;
      div.appendChild(span);
    };

    const addText = (text, start, hl)=>{
      const spos = codeIn.indexOf(text, Math.max(srcPos, start));
      addRange(spos, spos+text.length, hl);
    };

    const addHl = (node, hl)=>{
      addRange(node.start.pos, node.end.endpos, hl);
    };

    const binaryExpr = (node)=>{
      expr(node.left);
      addText(node.operator, node.left.end.endpos, 'o');
      expr(node.right);
    };

    const expr = node=>{
      if (node == null) return;
      if (node.walk !== undefined)
        node.walk(visitor);
      else if (Array.isArray(node)) {
        node.forEach(expr);
      }
    };

    const addAsync = (node)=>{
      node.async && addText('async', node.start.pos, 'k');
    };

    const addType = (node, hl='k')=>{
      const spos = node.start.pos;
      addRange(spos, spos + node.TYPE.length, hl);
    };

    const loopControl = (node)=>{
      addType(node);
      expr(node.label);
    };

    const functionExpression = (node)=>{
      addAsync(node);
      addText('function', node.start.pos, 'kd');
      expr(node.name);
      expr(node.argnames);
      expr(node.body);
    };

    const addplain = node => {catchup(node.end.endpos)};

    const definition = (node, descend)=>{
      const spos = node.start.pos;
      addType(node, 'kd');
      descend();
    };

    const addKey = (node, type='na')=>{
      let {key} = node;
      const nev = key === node.value.name;
      let kw = nev && visitor.parent().TYPE === 'Destructuring'
          ? 'nv' : type;

      if (typeof key === 'object') {
        if (key.TYPE === 'SymbolMethod') {
          key = key.name;
          kw = 'nf';
        } else {
          expr(key);
          return nev;
        }
      }
      if (key === 'constructor') {
        kw = 'k';
      }
      if (node.quote != null) key = `${node.quote}${key}${node.quote}`;
      addText(key, node.start.pos, kw);
      return nev;
    };

    const addKWExpBody = (node)=>{
      addType(node);
      expr(node.expression);
      expr(node.body);
    };

    const addKWBody = (node)=>{
      addType(node);
      expr(node.body);
    };

    const addStatic = (node)=>{node.static && addText('static', node.start.pos, 'kt')};

    const WELLKNOWN = {
      NaN: 'm',
      Infinity: 'm',
      undefined: 'kc',
    };

    const TYPES = {
      True: 'kc',
      False: 'kc',
      Null: 'kc',
      Undefined: 'kc',
      Number: 'm',
      NaN: 'm',
      Infinity: 'm',
      String: 's',
      RegExp: 'sr',
      TemplateSegment: 's',
      Super: 'k',
      This: 'k',
      SymbolDefClass: 'nc',
      SymbolFunarg: 'nv',
      SymbolCatch: 'nv',
      SymbolConst: 'no',
      SymbolVar: 'nv',
      SymbolLet: 'nv',
      Label: 'nl',
      LabelRef: 'nl',
      SymbolRef(node) {
        addHl(node, WELLKNOWN[node.name] || 'nx');
      },
      Break: loopControl,
      Continue: loopControl,
      SymbolMethod(node) {
        addText(node.name, srcPos, node.name === 'constructor' ? 'k' : 'nf');
      },
      Binary: binaryExpr,
      DefaultAssign: binaryExpr,
      FunctionDeclaration: functionExpression,
      Function: functionExpression,
      Call(node) {
        expr(node.expression);
        expr(node.args);
      },
      Arrow(node) {
        addAsync(node);
        expr(node.argnames);
        addText('=>', srcPos, 'o');
        expr(node.body);
      },
      Assign(node) {
        node.left.TYPE === 'SymbolRef' ? addHl(node.left, 'nx') : expr(node.left);
        addText(node.operator, node.left.end.endpos, 'o');
        expr(node.right);
      },
      Conditional(node) {
        expr(node.condition);
        addText('?', srcPos, 'o');
        expr(node.consequent);
        addText(':', srcPos, 'o');
        expr(node.alternative);
      },
      DefClass(node) {
        addText('class', node.start.pos, 'k');
        expr(node.name);
        if (node.extends) {
          addText('extends', srcPos, 'k');
          expr(node.extends);
        }
        expr(node.properties);
        expr(node.body);
      },
      Defun(node, descend) {
        addText('function', node.start.pos, 'kd');
        descend();
      },
      SymbolDefun(node) {
        addText(node.name, node.start.pos, 'nf');
      },
      ClassExpression(node) {TYPES.DefClass(node)},
      Dot(node) {
        expr(node.expression);
        addText(node.property, srcPos, 'na');
      },
      ConciseMethod(node) {
        addStatic(node);
        addKey(node, 'nf');
        expr(node.value);
      },
      ObjectGetter(node) {
        addStatic(node);
        addText('get', node.start.pos, 'k');
        addKey(node, 'nf');
        expr(node.value);
      },
      ObjectSetter(node) {
        addStatic(node);
        addText('set', node.start.pos, 'k');
        addKey(node, 'nf');
        expr(node.value);
      },
      ObjectKeyVal(node) {
        const {value} = node;
        if (value.TYPE === 'DefaultAssign' && value.left.name === node.key) {
          addText(node.key, node.start.pos, 'nv');
          addText('=', srcPos, 'o');
          expr(value.right);
        } else if (!addKey(node)) {
          if (value.TYPE === 'DefaultAssign' && value.left.TYPE === 'SymbolFunarg') {
            addText(value.left.name, value.left.start.pos, 'nv');
            addText('=', srcPos, 'o');
            expr(value.right);
          } else
            expr(value);
        }
      },
      New(node) {
        addText('new', node.start.pos, 'k');
        expr(node.expression);
        expr(node.args);
      },
      Return(node) {
        addText('return', node.start.pos, 'k');
        expr(node.value);
      },
      Throw(node) {
        addText('throw', node.start.pos, 'k');
        expr(node.value);
      },
      Expansion(node) {
        addText('...', node.start.pos, 'k');
        expr(node.expression);
      },
      UnaryPrefix(node) {
        addText(node.operator, node.start.pos, 'o');
        expr(node.expression);
      },
      UnaryPostfix(node) {
        expr(node.expression);
        addText(node.operator, node.start.pos, 'o');
      },

      Switch: addKWExpBody,
      Case: addKWExpBody,
      Default: addKWBody,

      Try(node) {
        addType(node);
        expr(node.body);
        expr(node.bcatch);
        expr(node.bfinally);
      },
      Catch(node) {
        addType(node);
        expr(node.argname);
        expr(node.body);
      },
      Finally: addKWBody,

      Do(node) {
        addType(node);
        expr(node.body);
        addText('while', srcPos, 'k');
        expr(node.condition);
      },
      While(node) {
        addType(node);
        expr(node.condition);
        expr(node.body);
      },
      For(node) {
        addType(node);
        expr(node.init);
        expr(node.condition);
        expr(node.step);
        expr(node.body);
      },
      ForOf(node) {
        addText('for', node.start.pos, 'k');
        expr(node.init);
        addText('of', srcPos, 'k');
        expr(node.object);
        expr(node.body);
      },
      ForIn(node) {
        addText('for', node.start.pos, 'k');
        expr(node.init);
        addText('in', srcPos, 'k');
        expr(node.object);
        expr(node.body);
      },
      If(node) {
        addType(node);
        expr(node.condition);
        expr(node.body);
        if (node.alternative != null) {
          addText('else', srcPos, 'k');
          expr(node.alternative);
        }
      },

      Var: definition,
      Const: definition,
      Let: definition,
    };

    const visitor = new terser.TreeWalker((node, descend) => {
      leadingComments(node);
      const hl = TYPES[node.TYPE];
      switch (typeof hl) {
      case 'string': addHl(node, hl); break;
      case 'function': hl(node, descend); break;
      default:
        descend();
      }
      trailingComments(node);
      return true;
    });

    ast.walk(visitor);

    catchup(codeIn.length);

    return div;
  };

  {
    const tryParse = (iter)=>{
      let ex1;
      for (let code of iter) {
        try {
          const {ast, error} =terser.minify(code, {
            compress: false,
            mangle: false,
            output: {
              ast: true,
              code: false,
            }
          });
          if (ast !== undefined) return ast;
          ex1 = error;
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
          throw new Error(`${msg}:\n${ex}`);
        koru.error(msg);
        throw ex;
      }
      const args = [];

      const visitor = (node) => {
        switch(node.TYPE) {
        case 'Arrow':
        case 'Function':
          node.argnames.forEach(n => args.push(n.name));
          return true;
        case 'Accessor':
          node.walk(new terser.TreeWalker(node =>{
            if (node.TYPE === 'SymbolFunarg') {
              args.push(node.name);
              return true;
            }
          }));
          return true;
        }
      };

      ast.walk(new terser.TreeWalker(visitor));

      return args;
    };
  }

  return JsPaser;
});

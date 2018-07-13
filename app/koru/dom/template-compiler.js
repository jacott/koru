const Path = require('path');
const htmlparser = requirejs.nodeRequire("htmlparser2");

define((require)=>{
  const Compilers       = require('koru/compilers');
  const htmlEncode      = require('koru/dom/html-encode');
  const fst             = require('../fs-tools');

  const {unescapeHTML} = htmlEncode;
  const IGNORE = {xmlns: true};

  class CompilerError extends SyntaxError {
    constructor(message, filename, point) {
      super(`${message}\n\tat ${filename}:${point}`);
      this.filename = filename;
      this.point = point;
    }
  }

  const Compiler = {
    toJavascript(code, filename) {
      let template;
      let result = '';
      try {
        const parser = new htmlparser.Parser({
          onopentag(name, attrs){
            if (template === undefined && name !== 'template') {
              template = new Template(undefined, {
                name: Path.basename(filename).replace(/\..*$/,'').split('-')
                  .map(n => n ? n[0].toUpperCase() + n.slice(1) : '').join('')
              });

            }
            if (name === 'template') {
              name = attrs.name;
              if (! name)
                throw new CompilerError(
                  "Template name is missing", filename, parser.startIndex);
              if (! name.match(/^([A-Z]\w*\.?)+$/))
                throw new CompilerError(
                  `Template name must match the format: Foo(.Bar)* ${name}`,
                  filename, parser.startIndex);
              template = new Template(template, attrs);

            } else {
              template.addNode(name, code.slice(parser.startIndex+2+name.length, parser.endIndex),
                               attrs.xmlns);
            }
          },
          ontext(text){
            template.addText(unescapeHTML(text.replace(/(?:^\s+|\s+$)/g, ' ')));
          },
          onclosetag(name){
            if (name === 'template') {
              if (template.parent) {
                template = template.parent;
              }
            } else {
              template.endNode();
            }
          }
        }, {lowerCaseTags: false, lowerCaseAttributeNames: false});
        parser.write(code);
        parser.end();
        if (template === undefined) {
          throw new CompilerError("Content missing", filename, parser.startIndex);
        }
        result += template.toString();
        return result;
      } catch (e) {
        throw e;
      }
    }
  };

  class Template {
    constructor(parent, attrs) {
      this.nested = [];
      this.name = attrs.name;
      this.attrs = attrs;
      this.nodes = {children: []};
      this.parent = parent;
      if (parent !== undefined) parent.add(this);
    }

    addNode(name, attrs, xmlns) {
      attrs = extractAttrs(attrs.endsWith('/') ? attrs.slice(0, -1) : attrs);
      const newNodes = {name, attrs, children: [], parent: this.nodes};

      if (xmlns)
        newNodes.ns = xmlns;

      this.nodes.children.push(newNodes);

      this.nodes = newNodes;
    }

    addText(text) {
      if (text === '' || text === ' ' || text === '  ') return null;
      const nodes = extractBraces(text);
      const chn = this.nodes.children;
      if (typeof nodes === 'string') {
        chn.push(text);
        return;
      }

      nodes.forEach(node => {
        if (typeof node === 'string')
          node && chn.push(node);
        else node.forEach(elm => {
          elm && chn.push(elm);
        });
      });
    }

    endNode() {
      this.nodes = this.nodes.parent;
    }

    toString() {
      return JSON.stringify(this.toHash());
    }

    toHash() {
      const content = Object.assign({}, this.attrs);
      if (this.nested.length)
        content.nested = this.nested.map(row => row.toHash());

      if (this.nodes.children.length)
        content.nodes = this.nodes.children.map(node => nodeToHash(node));

      return content;
    }

    fullName() {
      return (this.parent ? this.parent.fullName() : '') + "['" + this.name + "']";
    }

    add(child) {
      this.nested.push(child);
      return this;
    }
  }

  function nodeToHash(node) {
    if (typeof node === 'string' || node.shift)
      return node;

    const result =  {name: node.name, attrs: node.attrs, ns: node.ns};
    if (node.children.length)
      result.children = node.children.map(node => nodeToHash(node));

    return result;
  }

  function extractBraces(text) {
    const parts = text.split(/({{[\s\S]*?}})/);

    if (parts.length === 1) return text;
    if (parts[parts.length-1] === '') parts.pop();
    if (parts[0] === '') parts.shift();

    for(let i = 0; i < parts.length; ++i) {
      const part = parts[i];
      if (/^{{[\s\S]*?}}$/.test(part))
        parts[i] = [compileBraceExpr(part.slice(2,-2).trim())];
    }

    return parts;
  }

  function compileBraceExpr(bexpr) {
    let result;
    if (bexpr.match(/^[!#>\/]/)) {
      result = [bexpr[0]];
      bexpr = bexpr.slice(1).trim();
    } else {
      result = [''];
    }
    tokenizeWithQuotes(bexpr, result);
    return result;
  }


  function extractAttrs(attrs) {
    const tokens = [];
    const result = [];
    tokenizeWithQuotes(attrs, tokens);

    tokens.forEach(token => {
      if (typeof token === 'string') {
        result.push(justOne(extractBraces(token[0] === '"' ? token.slice(1) : token)));

      } else {
        token[2] = justOne(extractBraces(token[2][0] === '"' ? token[2].slice(1) : token[2]));
        result.push(token);
      }
    });

    return result;
  }


  function justOne(nodes) {
    if (typeof nodes === 'string') return nodes;


    for(let i=0; i < nodes.length; ++i) {
      let row = nodes[i];
      if (row) {
        if (typeof row === 'string') continue;
        row = nodes[i] = row[0];
        if (typeof row === 'string' || row.length < 3) continue;
        for(let j = 0; j < row.length; ++j) {
          const part = row[j];
          if (part.indexOf('.') !== -1) {
            row[j] = '.' + part;
          }
        }

//        return row;
      }
    }
    if (nodes.length == 1) return nodes[0];
    const ans = ['', 'join'];
    for(let i=0; i < nodes.length; ++i) {
      const row = nodes[i];
      if (typeof row === 'string')
        ans.push('"'+row);
      else {
        if (row.length == 2)
          ans.push(row[1]);
        else
          ans.push(row);
      }

    }
    return ans;
  }

  function tokenizeWithQuotes(bexpr, result) {
    // split by tokens
    while(bexpr !== '') {
      bexpr = bexpr.trim();
      if (bexpr.length === 0) return;

      const m = /^((?:"[^"]*"|'[^']*')|{{[\s\S]*?}}|[:-\w]+=(?:"[^"]*"|'[^']*'|[-\w]+))([\s\S]*)$/.exec(bexpr) || /([-\w\/\.]+)([\s\S]*)$/.exec(bexpr);

      if (m) {
        addToken(m[1], result);
        bexpr = m[2];
      } else {
        return addToken(bexpr, result);
      }
    }
  }

  function addToken(token, result) {
    const m = /^([:-\w]+)=([\s\S]*)$/.exec(token);
    if (m) {
      IGNORE[m[1]] || result.push(['=', m[1], quotenorm(m[2])]);
    } else {
      result.push(quotenorm(token));
    }
  }

  function quotenorm(token) {
    if (token.match(/^(['"])[\s\S]*\1$/))
      return '"' + token.slice(1,-1);
    else
      return token;
  }

  Compilers.set('html', (type, path, outPath)=>{
    const html = fst.readFile(path).toString();
    const js = Compiler.toJavascript(html, path);

    fst.writeFile(outPath, "define("+ js + ")");
  });

  return Compiler;
});

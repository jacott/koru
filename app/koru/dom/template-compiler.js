define((require) => {
  'use strict';
  const htmlEncode      = require('koru/dom/html-encode');
  const HTMLParser      = require('koru/parse/html-parser');
  const util            = require('koru/util');

  const {HTMLParseError} = HTMLParser;
  const {unescapeHTML} = htmlEncode;
  const IGNORE = {xmlns: true};

  class CompilerError extends SyntaxError {
    constructor(message, filename, point) {
      super(`${message}\n\tat ${filename}:${point}`);
      this.filename = filename;
      this.point = point;
    }
  }

  const filenameToTemplateName = (filename) => filename
        .replace(/^.*\//, '').replace(/\..*$/, '').split('-')
        .map((n) => n ? n[0].toUpperCase() + n.slice(1) : '').join('');

  const TemplateCompiler = {
    filenameToTemplateName,

    toJavascript: (code, filename='<anonymous>', templateName) => {
      let template;
      try {
        HTMLParser.parse(code, {
          filename,
          onopentag(name, attrs, code, spos, epos) {
            if (template === undefined && name !== 'template') {
              template = new Template(undefined, {
                name: templateName ?? filenameToTemplateName(filename),
              });
            }
            if (name === 'template') {
              name = attrs.name;
              if (! name) {
                throw ['Template name is missing', spos];
              }
              if (! name.match(/^([A-Z]\w*\.?)+$/)) {
                throw [`Template name must match the format: Foo(.Bar)* ${name}`, spos];
              }
              template = new Template(template, attrs);
            } else {
              template.addNode(name, code.slice(spos + 2 + name.length, epos - 1),
                               attrs.xmlns);
            }
          },
          ontext(code, si, ei) {
            template !== void 0 &&
              template.addText(unescapeHTML(code.slice(si, ei).replace(/(?:^\s+|\s+$)/g, ' ')));
          },
          onclosetag(name) {
            if (name === 'template') {
              if (template.parent) {
                template = template.parent;
              }
            } else {
              template.endNode();
            }
          },
        });
        if (template === undefined) {
          throw ['Content missing', filename, 0];
        }
        return template;
      } catch (err) {
        if (err.constructor !== Array) throw err;
        const lc = util.indexTolineColumn(code, err[1]);
        throw new HTMLParseError(err[0], filename, lc[0], lc[1]);
      }
    },
  };

  const nodeToJson = (node) => {
    if (typeof node === 'string' || node.shift) {
      return node;
    }

    const result = {name: node.name};
    if (node.attrs.length != 0) result.attrs = node.attrs;
    if (node.ns !== void 0) result.ns = node.ns;
    if (node.children.length) {
      result.children = node.children.map((node) => nodeToJson(node));
    }

    return result;
  };

  const extractBraces = (text) => {
    const parts = text.split(/({{[\s\S]*?}})/);

    if (parts.length === 1) return text;
    if (parts[parts.length - 1] === '') parts.pop();
    if (parts[0] === '') parts.shift();

    for (let i = 0; i < parts.length; ++i) {
      const part = parts[i];
      if (/^{{[\s\S]*?}}$/.test(part)) {
        parts[i] = [compileBraceExpr(part.slice(2, -2).trim())];
      }
    }

    return parts;
  };

  const compileBraceExpr = (bexpr) => {
    let result;
    if (bexpr.match(/^[!#>\/]/)) {
      result = [bexpr[0]];
      bexpr = bexpr.slice(1).trim();
    } else {
      result = [''];
    }
    tokenizeWithQuotes(bexpr, result, false);
    return result;
  };

  const extractAttrs = (attrs) => {
    const tokens = [];
    const result = [];
    tokenizeWithQuotes(attrs, tokens, true);

    tokens.forEach((token) => {
      if (typeof token === 'string') {
        result.push(justOne(extractBraces(token[0] === '"' ? token.slice(1) : token)));
      } else {
        if (token.length == 3) {
          token[2] = justOne(extractBraces(token[2][0] === '"' ? token[2].slice(1) : token[2]));
        } else {
          token[1] = justOne(extractBraces(token[1][0] === '"' ? token[1].slice(1) : token[1]));
        }
        result.push(token);
      }
    });

    return result;
  };

  const justOne = (nodes) => {
    if (typeof nodes === 'string') return nodes;

    for (let i = 0; i < nodes.length; ++i) {
      let row = nodes[i];
      if (row) {
        if (typeof row === 'string') continue;
        row = nodes[i] = row[0];
        if (typeof row === 'string' || row.length < 3) continue;
        for (let j = 0; j < row.length; ++j) {
          const part = row[j];
          if (typeof part !== 'string' || part[0] === '"') continue;
          if (part.indexOf('.') !== -1) {
            row[j] = makeDotToken(part);
          }
        }
      }
    }
    if (nodes.length == 1) return nodes[0];
    const parts = [];
    const ans = ['', 'join', parts];
    for (let i = 0; i < nodes.length; ++i) {
      const row = nodes[i];
      if (typeof row === 'string') {
        parts.push('"' + row);
      } else {
        if (row.length == 2) {
          parts.push(row[1]);
        } else {
          parts.push(row);
        }
      }
    }
    return ans;
  };

  const tokenizeWithQuotes = (bexpr, result, isAttrs) => {
    // split by tokens
    while (bexpr !== '') {
      bexpr = bexpr.trim();
      if (bexpr.length === 0) return;

      const m = /^((?:"[^"]*"|'[^']*')|{{[\s\S]*?}}|[:-\w]+=(?:"[^"]*"|'[^']*'|[-\w]+))([\s\S]*)$/.exec(bexpr) || /([-\w\/\.]+)([\s\S]*)$/.exec(bexpr);

      if (m !== null) {
        addToken(m[1], result, isAttrs);
        bexpr = m[2];
      } else {
        return addToken(bexpr, result, isAttrs);
      }
    }
  };

  const addToken = (token, result, isAttrs) => {
    const m = /^([:-\w]+)=([\s\S]*)$/.exec(token);
    let arg;
    if (m !== null) {
      if (IGNORE[m[1]]) return;
      arg = ['=', m[1], quotenorm(m[2])];
    } else {
      arg = quotenorm(token);
    }
    if (isAttrs || result.length < 2) {
      result.push(arg);
    } else if (result.length == 2) {
      result.push([arg]);
    } else {
      result[2].push(arg);
    }
  };

  const makeDotToken = (token, idx) => {
    const [main, ...rest] = token.split('.');
    return ['.', main, rest];
  };

  const quotenorm = (token) => {
    if (token.match(/^(['"])[\s\S]*\1$/)) {
      return '"' + token.slice(1, -1);
    } else {
      const num = +token;
      if (num === num) {
        return num;
      }
      if (token[0] !== '{' && token.indexOf('.') > 0) {
        return makeDotToken(token);
      }

      return token;
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

      if (xmlns) {
        newNodes.ns = xmlns;
      }

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

      nodes.forEach((node) => {
        if (typeof node === 'string') {
          node && chn.push(node);
        } else {
          node.forEach((elm) => {
            elm && chn.push(elm);
          });
        }
      });
    }

    endNode() {
      this.nodes = this.nodes.parent;
    }

    toString() {
      return JSON.stringify(this.toJson());
    }

    toJson() {
      const content = Object.assign({}, this.attrs);
      if (this.nested.length) {
        content.nested = this.nested.map((row) => row.toJson());
      }

      if (this.nodes.children.length) {
        content.nodes = this.nodes.children.map((node) => nodeToJson(node));
      }

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

  return TemplateCompiler;
});

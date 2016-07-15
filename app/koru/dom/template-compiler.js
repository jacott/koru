const Path = require('path');
const htmlparser = requirejs.nodeRequire("htmlparser2");

const Compiler = {
  Error(message, point) {
    this.message = message;
    this.point = point;
  },
  toJavascript(code) {
    var template;
    var result = '';
    try {
      var parser = new htmlparser.Parser({
        onopentag: function(name, attrs){
          if (name === 'template') {
            name = attrs.name;
            if (! name)
              throw new Compiler.Error("Template name is missing", parser.startIndex);
            if (! name.match(/^([A-Z]\w*\.?)+$/))
              throw new Compiler.Error("Template name must match the format: Foo(.Bar)*  " + name, parser.startIndex);
            template = new Template(template, attrs);

          } else {
            if (! template)
              throw new Compiler.Error("Out most element must be a template", parser.startIndex);

            template.addNode(name, code.slice(parser.startIndex+2+name.length, parser.endIndex));
          }
        },
        ontext: function(text){
          template.addText(text.replace(/^\s+/, ' ').replace(/\s+$/, ' '));
        },
        onclosetag: function(name){
          if (name === 'template') {
            if (template.parent)
              template = template.parent;
            else
              result += template.toString();
          } else {
            template.endNode();
          }
        }
      });
      parser.write(code);
      parser.end();
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
    this.extends = attrs.extends;
    this.nodes = {children: []};
    this.parent = parent;
    if (parent) parent.add(this);
  }

  addNode(name, attrs) {
    attrs = extractAttrs(attrs);
    var newNodes = {name: name, attrs: attrs, children: [], parent: this.nodes};

    this.nodes.children.push(newNodes);

    this.nodes = newNodes;
  }

  addText(text) {
    if (text === '' || text === ' ' || text === '  ') return null;
    var nodes = extractBraces(text);
    if (typeof nodes === 'string')
      return this.nodes.children.push(text);

    var chn = this.nodes.children;
    nodes.forEach(function (node) {
      if (typeof node === 'string')
        node && chn.push(node);
      else node.forEach(function (elm) {
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
    const content = {name: this.name};
    if (this.extends) content.extends = this.extends;
    if (this.nested.length)
      content.nested = this.nested.map(function (row) {
        return row.toHash();
      });

    if (this.nodes.children.length)
      content.nodes = this.nodes.children.map(function (node) {
        return nodeToHash(node);
      });

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

  var result =  {name: node.name, attrs: node.attrs};
  if (node.children.length)
    result.children = node.children.map(function (node) {
      return nodeToHash(node);
    });

  return result;
}

function extractBraces(text) {
  var parts = text.split('{{');
  if (parts.length === 1) return text;
  if (parts[0] === '') parts.shift();

  for(var i=0; i < parts.length; ++i) {
    var m = /(.*)}}(.*)/.exec(parts[i]);
    if (m) {
      parts[i] = [compileBraceExpr(m[1]), m[2]];
    }
  }

  return parts;
}

function compileBraceExpr(bexpr) {
  if (bexpr.match(/^[!#>\/]/)) {
    var result = [bexpr[0]];
    bexpr = bexpr.slice(1).trim();
  } else {
    var result = [''];
  }
  tokenizeWithQuotes(bexpr, result);
  return result;
}


function extractAttrs(attrs) {
  var tokens = [];
  var result = [];
  tokenizeWithQuotes(attrs, tokens);

  tokens.forEach(function (token) {
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

  for(var i=0; i < nodes.length; ++i) {
    var row = nodes[i];
    if (row) {
      row = row[0];
      if (typeof row === 'string' || row.length < 3) return row;
      for(var j = 0; j < row.length; ++j) {
        var part = row[j];
        if (part.indexOf('.') !== -1) {
          row[j] = '.' + part;
        }
      }

      return row;
    }
  }
}

function tokenizeWithQuotes(bexpr, result) {
  // split by tokens
  while(bexpr !== '') {
    bexpr = bexpr.trim();
    if (bexpr.length === 0) return;

    var m = /^((?:"[^"]*"|'[^']*')|{{(?:[^}]+}}|(?:[^}]+}[^}])+[^}]*}})|[-\w]+=(?:"[^"]*"|'[^']*'|[-\w]+))(.*)$/.exec(bexpr) || /([-\w\/\.]+)(.*)$/.exec(bexpr);

    if (m) {
      addToken(m[1], result);
      bexpr = m[2];
    } else {
      return addToken(bexpr, result);
    }
  }
}

function addToken(token, result) {
  var m = /^([-\w]+)=(.*)$/.exec(token);
  if (m) {
    result.push(['=', m[1], quotenorm(m[2])]);
  } else {
    result.push(quotenorm(token));
  }
}

function quotenorm(token) {
  if (token.match(/^(['"]).*\1$/))
    return '"' + token.slice(1,-1);
  else
    return token;
}

define(Compiler);

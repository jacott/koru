define(function(require, exports, module) {
  if (isClient) return window.document;
  var util = require('koru/util');
  var koru = require('koru');

  var CssSelectorParser = requirejs.nodeRequire('css-selector-parser').CssSelectorParser;
  var htmlparser = requirejs.nodeRequire("htmlparser2");
  var cssParser = new CssSelectorParser();

  cssParser.registerSelectorPseudos('has');
  cssParser.registerNestingOperators('>', '+', '~');
  cssParser.registerAttrEqualityMods('^', '$', '*', '~');
  cssParser.enableSubstitutes();

  koru.onunload(module, function () {
    delete global.document;
  });

  var threadMap = new WeakMap;

  Object.defineProperty(global, 'document', {configurable: true, get: function () {
    var key = util.Fiber.current || global;
    var doc = threadMap.get(key);
    if (! doc)
      threadMap.set(key, doc = new Document);

    return doc;
  }});

  function Document() {
    common(this, DOCUMENT_NODE);
    this.appendChild(this.body = new DocumentElement('body'));

  }

  var ELEMENT_NODE = 1;
  var TEXT_NODE = 3;
  var DOCUMENT_NODE = 9;
  var DOCUMENT_FRAGMENT_NODE = 11;

  Document.prototype = {
    constructor: Document,

    ELEMENT_NODE: ELEMENT_NODE,
    TEXT_NODE: TEXT_NODE,
    DOCUMENT_FRAGMENT_NODE: DOCUMENT_FRAGMENT_NODE,

    createElement: function (tag) {return new DocumentElement(tag)},
    createTextNode: function (value) {return new TextNode(value)},
    createDocumentFragment: function () {return new DocumentFragment()},

    appendChild: function (node) {
      node.parentNode = this;
      this.childNodes.push(node);
    },

    get firstChild() {
      var nodes = this.childNodes;
      return nodes.length ? nodes[0] : null;
    },

    get lastChild() {
      var nodes = this.childNodes;
      return nodes.length ? nodes[nodes.length - 1] : null;
    },

    get outerHTML() {return this.innerHTML},
    get innerHTML() {
      var childNodes = this.childNodes;
      var len = childNodes.length;
      var result = [];
      for(var i = 0; i < len; ++i) {
        result[i] = childNodes[i].outerHTML;
      }

      return result.join('');
    },
    set innerHTML(code) {
      var node = this;
      node.childNodes = [];
      var parser = new htmlparser.Parser({
        onopentag: function(name, attrs){
          var elm = new DocumentElement(name);
          node.appendChild(elm);
          for(var attr in attrs)
            elm.setAttribute(attr, attrs[attr]);

          node = elm;
        },
        ontext: function(text){
          node.appendChild(new TextNode(text));
        },
        onclosetag: function(name){
          node = node.parentNode;
        }
      });
      parser.write(code);
      parser.end();
    },

    set textContent(value) {this.childNodes = [new TextNode(value)]},

    get textContent() {
      var childNodes = this.childNodes;
      var len = childNodes.length;

      var result = [];
      for(var i = 0; i < len; ++i) {
        var elm = childNodes[i];
        result[i] = childNodes[i].textContent;
      }
      return result.join('');
    },

    querySelectorAll: function (css) {
      css = cssParser.parse(css).rule;

      var results = [];
      util.forEach(this.childNodes, function (node) {
        if (node.nodeType !== ELEMENT_NODE) return;

        if (node.tagName.toLowerCase() === css.tagName)
          results.push(node);
      });
      return results;
    },
  };

  function parseCss(css) {
    return [{
      tag: css.split.toUpperCase(),
    }];
  }

  function DocumentFragment() {
    common(this, DOCUMENT_FRAGMENT_NODE);
  }
  buildNodeType(DocumentFragment, {});

  function DocumentElement(tag) {
    common(this, ELEMENT_NODE);
    this.tagName = tag.toUpperCase();
    this.attributes = {};
  }
  buildNodeType(DocumentElement, {
    set id(value) {this.setAttribute('id', value)},
    get id() {return this.getAttribute('id')},
    set className(value) {this.setAttribute('class', value)},
    get className() {return this.getAttribute('class')},
    get outerHTML() {
      var tn = this.tagName.toLowerCase();
      var attrs = this.attributes;
      if (util.isObjEmpty(attrs)) {
        var open = tn;
      } else {
        var open = [tn];
        for(var attr in attrs) {
          open.push(attr+'="'+attrs[attr]+'"');
        }
        open = open.join(' ');
      }

      return "<"+open+">"+this.innerHTML+"</"+tn+">";
    },

    setAttribute: function (name, value) {this.attributes[name] = value},
    getAttribute: function (name) {return this.attributes[name]},

    get classList() {
      return new ClassList(this);
    },
  });

  function ClassList(node) {
    this.node = node;
  }

  ClassList.prototype = {
    constructor: ClassList,

    contains: function (value) {
      return new RegExp("\\b" + util.regexEscape(value) + "\\b").test(this.node.attributes.class);
    },

    add: function (value) {
      value = ''+value;
      var attrs = this.node.attributes;
      if (attrs.class) {
        this.contains(value) || (attrs.class += ' ' + value);
      } else {
        attrs.class = value;
      }
    },

    remove: function (value) {
      var attrs = this.node.attributes;
      attrs.class = attrs.class.replace(new RegExp("\\s?\\b" + util.regexEscape(value) + "\\b"), '');
    },
  };

  function TextNode(value) {
    common(this, TEXT_NODE);
    this.wholeText = value;
  }
  buildNodeType(TextNode, {
    get textContent() {return this.wholeText},
    set textContent(value) {this.wholeText = value},
    get innerHTML() {return escapeHTML(this.wholeText)},
    set innerHTML(value) {this.wholeText = value},
  });

  function buildNodeType(func, proto) {
    func.prototype = Object.create(Document.prototype, {});
    util.extend(func.prototype, proto);
  }

  function common(node, nodeType) {
    node.nodeType = nodeType;
    node.childNodes = [];
  }

  function escapeHTML(html) {
    return String(html)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  return Document;
});

define(function(require, exports, module) {
  if (isClient) return window.document;
  var util = require('koru/util');
  var koru = require('koru');

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
  }

  var ELEMENT_NODE = 1;
  var TEXT_NODE = 3;
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

    set textContent(value) {
      this.childNodes = [new TextNode(value)];
      return value;
    },

    get textContent() {
      var childNodes = this.childNodes;
      var len = childNodes;
      var result = [];
      for(var i = 0; i < len; ++i) {
        var elm = childNodes[i];
        if (elm.nodeType === TEXT_NODE)
          result[i] = childNodes[i].innerHTML;
      }

      return result.join('');
    }
  };

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
  });

  function TextNode(value) {
    common(this, TEXT_NODE);
    this.wholeText = value;
  }
  buildNodeType(TextNode, {
    set textContent(value) {this.wholeText = value},
    get textContent() {return this.wholeText},
    get innerHTML() {return this.wholeText},
  });

  function buildNodeType(func, proto) {
    func.prototype = Object.create(Document.prototype, {});
    util.extend(func.prototype, proto);
  }

  function common(node, nodeType) {
    node.nodeType = nodeType;
    node.childNodes = [];
  }

  return Document;
});

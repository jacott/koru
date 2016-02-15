define(function(require, exports, module) {
  if (isClient) return window.document;
  var util = require('koru/util');
  var koru = require('koru');
  var uColor = require('koru/util-color');

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

  function copyArray(from, to) {
    util.forEach(from, function (elm) {
      to.push(elm.cloneNode(true));
    });
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

    removeChild: function (node) {
      var parent = this;
      var nodes = parent.childNodes;

      for(var i = 0; i < nodes.length; ++i) {
        if (nodes[i] === node) {
          node.parentNode = null;
          nodes.splice(i, 1);
          return;
        }
      }
    },

    insertBefore: function (node, before) {
      var parent = this;
      if (! before)
        return parent.appendChild(node);

      if (node.parentNode)
        node.parentNode.removeChild(node);

      var nodes = parent.childNodes;

      for(var i = 0; i < nodes.length; ++i) {
        if (nodes[i] === before) {
          if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
            var cns = node.childNodes;
            var cnsLen = cns.length;
            var j = nodes.length += cnsLen;
            ++i;
            while(--j > i)
              nodes[j] = nodes[j-cnsLen];

            while (--cnsLen >= 0)
              (nodes[j--] = cns[cnsLen]).parentNode = parent;
            cns.length = 0;
          } else {

            node.parentNode = parent;
            nodes.splice(i, 0, node);
          }
          return;
        }
      }
      throw new Error("before node is not a child");
    },

    appendChild: function (node) {
      if (node.parentNode)
        node.parentNode.removeChild(node);
      if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
        var nodes = this.childNodes;
        var cns = node.childNodes;
        var cnsLen = cns.length;
        var j = nodes.length += cnsLen;
        while (--cnsLen >= 0)
          (nodes[--j] = cns[cnsLen]).parentNode = this;
        cns.length = 0;
      } else {
        node.parentNode = this;
        this.childNodes.push(node);
      }
    },

    cloneNode: function (deep) {
      var copy = new this.constructor;

      if (deep && copy.nodeType === DOCUMENT_NODE) {
        var to = copy.childNodes;
        to.pop();
        util.forEach(this.childNodes, function (elm) {
          elm = elm.cloneNode(true);
          if (elm.tagName === 'BODY')
            copy.body = elm;
          to.push(elm);
        });
      }

      return copy;
    },

    get style() {
      if (this.__style) return this.__style;
      return this.__style = new Style(this);
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
          node.appendChild(new TextNode(unescapeHTML(text)));
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
  buildNodeType(DocumentFragment, {
    cloneNode: function (deep) {
      var copy = new DocumentFragment();

      deep && copyArray(this.childNodes, copy.childNodes);
      return copy;
    },
  });

  var NOCLOSE = util.toMap("BR HR INPUT LINK".split(' '));

  function DocumentElement(tag) {
    common(this, ELEMENT_NODE);
    this.tagName = (''+tag).toUpperCase();
    this.attributes = {};
  }
  buildNodeType(DocumentElement, {
    cloneNode: function (deep) {
      var copy = new DocumentElement(this.tagName);
      copy.attributes = util.deepCopy(this.attributes);
      deep && copyArray(this.childNodes, copy.childNodes);
      return copy;
    },
    set id(value) {this.setAttribute('id', value)},
    get id() {return this.getAttribute('id')},
    set className(value) {this.setAttribute('class', value)},
    get className() {return this.getAttribute('class') || ''},
    get outerHTML() {
      var tn = this.tagName.toLowerCase();
      var attrs = this.attributes;
      if (this.__style) {
        var cssText = this.style._origCssText();
      }
      if (util.isObjEmpty(attrs)) {
        var open = tn;
        if (cssText) open += ' style="'+cssText+'"';
      } else {
        var open = [tn];
        for(var attr in attrs) {
          open.push(attr+'="'+attrs[attr]+'"');
        }
        cssText && open.push('style="'+cssText+'"');
        open = open.join(' ');
      }

      if (! this.childNodes.length && NOCLOSE.hasOwnProperty(this.tagName))
        return "<"+open+">";

      return "<"+open+">"+this.innerHTML+"</"+tn+">";
    },

    setAttribute: function (name, value) {
      if (name === 'style')
        this.style.cssText = value;
      else
        this.attributes[name] = value;
    },
    getAttribute: function (name) {
      if (name === 'style')
        return this.style._origCssText();
      else
        return this.attributes[name];
    },

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
    cloneNode: function (deep) {
      return new TextNode(this.wholeText);
    },
    get textContent() {return this.wholeText},
    set textContent(value) {this.wholeText = value},
    get innerHTML() {return escapeHTML(this.wholeText)},
    set innerHTML(value) {this.wholeText = unescapeHTML(value)},
  });

  function buildNodeType(func, proto) {
    func.prototype = Object.create(Document.prototype, {});
    func.prototype.constructor = func;
    util.extend(func.prototype, proto);
  }

  function common(node, nodeType) {
    node.nodeType = nodeType;
    node.childNodes = [];
  }

  function escapeHTML(html) {
    return String(html)
      .replace(/[&<>\xa0]/g, function (m) {return CHAR_TO_NAME[m]});
  }

  var NAME_TO_CHAR = {
    amp: '&',
    quot: '"',
    lt: '<',
    gt: '>',
    nbsp: '\xa0',
    euro: '\u20ac',
  };

  var CHAR_TO_NAME = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '\xa0': '&nbsp;',
  };

  function unescapeHTML(html) {
    return html
      .replace(/\&(#\d+|[a-z]+);/gi, function (m, d) {
        if (d[0] === '#')
          return String.fromCharCode(+d.slice(1));
        return NAME_TO_CHAR[d.toLowerCase()] || m;
      });
  }

  function Style(node) {
    var me = this;
    me._node = node;
    me._styles = {};
    me._styleArray = [];
    this._needBuild = true;
  }


  Style.prototype = {
    constructor: Style,

    get length() {return this._styleArray.length},

    item: function (index) {return this._styleArray[index]},

    _setStyle: function (name, dname, value) {
      this._needBuild = true;
      var styles = this._styles;
      var oldValue = styles[name];
      if (oldValue === value) return;
      if (oldValue === undefined) {
        styles[this._styleArray.length] = name;
        this._styleArray.push(dname);
      }
      styles[dname] = styles[name] = value;
    },

    _origCssText: function () {
      this._needBuild && this._rebuild();
      return this._cssText;
    },

    _rebuild: function () {
      this._needBuild = false;
      this._cssText = this.cssText;
    },

    get cssText() {
      var sm = this._styles;
      return this._styleArray.map(function (dname) {
        var value = sm[dname];
        if (! /color/.test(dname) && / /.test(value))
          value = "'"+value+"'";
        return dname+": "+value+";";
      }).join(" ");
    },

    set cssText(cssText) {
      this._cssText = cssText;
      var sm = this._styles = {};
      var sa = this._styleArray = [];
      this._needBuild = false;
      var styles = cssText.split(/\s*;\s*/);
      for(var i = 0; i < styles.length; ++i) {
        var style = styles[i];
        if (! style) {
          styles.length = i;
          break;
        }
        var idx = style.indexOf(':');
        var dname = style.slice(0, idx);
        var name = util.camelize(dname);
        var value = style.slice(idx+1).trim();
        if (/color/.test(dname))
          value = (value && uColor.toRgbStyle(value)) || '';
        sm[dname] = sm[name] = value;
        sa.push(dname);
      }
    },
  };

  'text-align font-size font-family font-weight font-style text-decoration background-color color'.split(' ').forEach(function (dname) {
    var name = util.camelize(dname);
    var get = function () {return this._styles[name] || ''};
    var set = /color/i.test(name) ? function (value) {
      this._setStyle(name, dname, (value && uColor.toRgbStyle(value)) || '');
    } : function (value) {this._setStyle(name, dname, value)};

    Object.defineProperty(Style.prototype, name, {
      configurable: true,
      get: get,
      set: set,
    });

    Object.defineProperty(Style.prototype, dname, {
      configurable: true,
      get: get,
      set: set,
    });
  });


  return Document;
});

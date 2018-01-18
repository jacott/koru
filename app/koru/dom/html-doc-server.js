define(function(require, exports, module) {
  const koru            = require('koru');
  const Dom             = require('koru/dom/base');
  const htmlEncode      = require('koru/dom/html-encode');
  const util            = require('koru/util');
  const uColor          = require('koru/util-color');

  const CssSelectorParser = requirejs.nodeRequire('css-selector-parser').CssSelectorParser;
  const htmlparser        = requirejs.nodeRequire('htmlparser2');

  const {hasOwn} = util;
  const {SVGNS} = Dom;
  const {escapeHTML, unescapeHTML} = htmlEncode;

  const style$ = Symbol(), cssText$ = Symbol(), pos$ = Symbol(), styles$ = Symbol(), styleArray$ = Symbol(),
        needBuild$ = Symbol(), attributes$ = Symbol(),
        doc$ = Symbol();

  const cssParser = new CssSelectorParser();

  cssParser.registerSelectorPseudos('has');
  cssParser.registerNestingOperators('>', '+', '~');
  cssParser.registerAttrEqualityMods('^', '$', '*', '~');
  cssParser.enableSubstitutes();

  koru.onunload(module, () => global.document = null);


  Object.defineProperty(global, 'document', {configurable: true, get() {
    const key = util.Fiber.current || global;
    const doc = key[doc$];
    if (doc == null) {
      const doc = new Document;
      key[doc$] = doc;
      return doc;
    }

    return doc;
  }});

  const copyArray = (from, to)=>{util.forEach(from, elm => to.push(elm.cloneNode(true)))};

  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;
  const COMMENT_NODE = 8;
  const DOCUMENT_NODE = 9;
  const DOCUMENT_FRAGMENT_NODE = 11;

  const NOCLOSE = util.toMap("BR HR INPUT LINK META".split(' '));

  const insertNodes = (from, toNode, pos)=>{
    const to = toNode.childNodes;
    let mlen = to.length - pos;

    let tlen = to.length += from.length;
    while (--mlen >= 0)
      to[--tlen] = to[pos+mlen];

    for(let i = pos+from.length-1; i >= pos ; --i) {
      const fnode = from[i-pos];
      fnode.parentNode = toNode;
      to[i] = fnode;
    }

    from.length = 0;
  };

  class Element {
    constructor(nodeType) {
      this.nodeType = nodeType;
      this.parentNode = null;
      this.childNodes = [];
    }

    remove() {
      if (this.parentNode != null)
        this.parentNode.removeChild(this);
    }

    removeChild(node) {
      const nodes = this.childNodes;

      for(let i = 0; i < nodes.length; ++i) {
        if (nodes[i] === node) {
          node.parentNode = null;
          nodes.splice(i, 1);
          return;
        }
      }
    }

    replaceChild(newNode, oldNode) {
      const nodes = this.childNodes;

      for(let i = 0; i < nodes.length; ++i) {
        if (nodes[i] === oldNode) {
          oldNode.parentNode = null;
          if (newNode.nodeType === DOCUMENT_FRAGMENT_NODE) {
            const cns = newNode.childNodes;
            nodes[i] = cns.pop();
            insertNodes(cns, this, i);
          } else {
            if (newNode.parentNode != null)
              newNode.parentNode.removeChild(newNode);
            nodes[i] = newNode;
            newNode.parentNode = this;
          }
          return oldNode;
        }
      }
    }

    insertBefore(node, before) {
      if (! before)
        return this.appendChild(node);

      if (node.parentNode != null)
        node.parentNode.removeChild(node);

      const nodes = this.childNodes;

      for(let i = 0; i < nodes.length; ++i) {
        if (nodes[i] === before) {
          if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
            insertNodes(node.childNodes, this, i);
          } else {

            node.parentNode = this;
            nodes.splice(i, 0, node);
          }
          return node;
        }
      }
      throw new Error("before node is not a child");
    }

    appendChild(node) {
      if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
        insertNodes(node.childNodes, this, this.childNodes.length);
      } else {
        if (node.parentNode != null)
          node.parentNode.removeChild(node);

        node.parentNode = this;
        this.childNodes.push(node);
      }
      return node;
    }

    get style() {
      if (this[style$] !== undefined) return this[style$];
      return this[style$] = new Style(this);
    }

    get firstChild() {
      const nodes = this.childNodes;
      return nodes.length ? nodes[0] : null;
    }

    get lastChild() {
      const nodes = this.childNodes;
      return nodes.length ? nodes[nodes.length - 1] : null;
    }

    get outerHTML() {return this.innerHTML}
    get innerHTML() {
      const {childNodes} = this, len = childNodes.length;
      let result = '';
      for(let i = 0; i < len; ++i) {
        result += childNodes[i].outerHTML;
      }

      return result;
    }
    set innerHTML(code) {
      let node = this;
      node.childNodes = [];
      const parser = new htmlparser.Parser({
        onopentag(name, attrs){
          const elm = createHTMLElement(name);
          node.appendChild(elm);
          for(const attr in attrs)
            elm.setAttribute(attr, attrs[attr]);

          node = elm;
        },
        ontext(text) {
          node.appendChild(new TextNode(unescapeHTML(text)));
        },
        oncomment(text) {
          node.appendChild(new CommentNode(unescapeHTML(text)));
        },
        onclosetag(name){
          node = node.parentNode;
        }
      });
      parser.write(code);
      parser.end();
    }

    set textContent(value) {this.childNodes = [new TextNode(value)]}

    get textContent() {
      const {childNodes} = this, len = childNodes.length;

      let result = '';
      for(let i = 0; i < len; ++i) {
        result += childNodes[i].textContent;
      }
      return result;
    }

    querySelectorAll(css) {
      css = cssParser.parse(css).rule;

      const results = [];
      util.forEach(this.childNodes, node => {
        if (node.nodeType !== ELEMENT_NODE) return;

        if (Dom.canonicalTagName(node) === css.tagName)
          results.push(node);
      });
      return results;
    }
  }

  global.Element = Element;

  Element.prototype.namespaceURI = Dom.XHTMLNS;

  const createHTMLElement = (tag)=>{
    return new (SPECIAL_TYPE[tag]||HTMLElement)(tag);
  };

  class Document extends Element {
    constructor() {
      super(DOCUMENT_NODE);
      this.appendChild(this.body = createHTMLElement('body'));
    }

    createElement(tag) {return createHTMLElement(tag)}
    createElementNS(xmlns, tag) {
      const canon = Dom.CANONICAL_TAG_NAMES[tag];
      if (canon === undefined) {
        if (xmlns === SVGNS)
          Dom.CANONICAL_TAG_NAMES[tag] = tag;
        else {
          const lc = tag.toLowerCase();
          Dom.CANONICAL_TAG_NAMES[lc] = lc;
          Dom.CANONICAL_TAG_NAMES[tag.toUpperCase()] = lc;
        }
      }
      const elm = createHTMLElement(tag);
      elm.namespaceURI = xmlns;
      return elm;
    }
    createTextNode(value) {return new TextNode(value)}
    createDocumentFragment() {return new DocumentFragment()}
    createComment(data) {return new CommentNode(data)}
  }

  Object.assign(Document.prototype, {
    ELEMENT_NODE,
    TEXT_NODE,
    COMMENT_NODE,
    DOCUMENT_FRAGMENT_NODE,
  });

  function parseCss(css) {
    return [{
      tag: css.split.toUpperCase(),
    }];
  }

  class DocumentFragment extends Element {
    constructor() {
      super(DOCUMENT_FRAGMENT_NODE);
    }

    cloneNode(deep) {
      const copy = new DocumentFragment();

      deep && copyArray(this.childNodes, copy.childNodes);
      return copy;
    }
  }

  class HTMLElement extends Element {
    constructor(tagName) {
      if (typeof tagName !== 'string')
        throw new Error('tagName is not a string');
      super(ELEMENT_NODE);
      const canon = Dom.CANONICAL_TAG_NAMES[tagName];
      const uc = tagName.toUpperCase();
      if (canon === undefined || canon !== tagName) {
        this.tagName = uc;
      } else {
        this.tagName = Dom.CANONICAL_TAG_NAMES[uc] !== undefined ? uc : canon;
      }
      this[attributes$] = {};
    }

    cloneNode(deep) {
      const copy = new this.constructor(this.tagName);
      copy[attributes$] = util.deepCopy(this[attributes$]);
      deep && copyArray(this.childNodes, copy.childNodes);
      return copy;
    }
    set id(value) {this.setAttribute('id', value)}
    get id() {return this.getAttribute('id')}
    set className(value) {this.setAttribute('class', value)}
    get className() {return this.getAttribute('class') || ''}
    get outerHTML() {
      const tn = Dom.canonicalTagName(this);
      const attrs = this[attributes$];
      const cssText = this[style$] !== undefined ? origCssText(this.style) : undefined;
      let open = tn;
      if (util.isObjEmpty(attrs)) {
        if (cssText) open += ' style="'+cssText+'"';
      } else {
        const oa = [tn];
        for(const attr in attrs) {
          oa.push(attr+'="'+attrs[attr]+'"');
        }
        cssText === undefined ||oa.push('style="'+cssText+'"');
        open = oa.join(' ');
      }

      if (this.childNodes.length == 0 && hasOwn(NOCLOSE, this.tagName))
        return "<"+open+">";

      return "<"+open+">"+this.innerHTML+"</"+tn+">";
    }

    setAttribute(name, value) {
      if (typeof value !== 'string') value = ''+value;
      if (name === 'style')
        this.style.cssText = value;
      else
        this[attributes$][name] = value;
    }
    getAttribute(name) {
      if (name === 'style')
        return origCssText(this.style);
      else
        return this[attributes$][name];
    }

    get attributes() {
      const ans = [];
      if (this.style.length != 0)
        ans.push({name: 'style', value: origCssText(this.style)});
      for (let name in this[attributes$])
        ans.push({name, value: this[attributes$][name]});
      return ans;
    }

    get classList() {
      return new ClassList(this);
    }

    getElementsByClassName(className) {
      const ans = [];
      const re = new RegExp("(?:^|\\s)" + util.regexEscape(className) + "(?=\\s|$)");

      Dom.walkNode(this, node => {
        if (node.nodeType !== ELEMENT_NODE)
          return false;

        re.test(node[attributes$].class) &&
          ans.push(node);
      });
      return ans;
    }
  }

  class StyleElement extends HTMLElement {
    get innerHTML() {return this.textContent}
  }

  class ScriptElement extends HTMLElement {
    get innerHTML() {return this.textContent}
  }

  const SPECIAL_TYPE = {
    style: StyleElement,
    script: ScriptElement,
  };

  class ClassList {
    constructor(node) {
      this.node = node;
    }

    contains(className) {
      return new RegExp("(?:^|\\s)" + util.regexEscape(className) + "(?=\\s|$)")
        .test(this.node[attributes$].class);
    }

    add(value) {
      value = ''+value;
      const attrs = this.node[attributes$];
      if (attrs.class) {
        this.contains(value) || (attrs.class += ' ' + value);
      } else {
        attrs.class = value;
      }
    }

    remove(value) {
      const attrs = this.node[attributes$];
      attrs.class = attrs.class.replace(new RegExp("\\s?\\b" + util.regexEscape(value) + "\\b"), '');
    }
  }

  class TextNode extends Element {
    constructor(value) {
      super(TEXT_NODE);
      this.wholeText = value;
    }

    cloneNode(deep) {
      return new TextNode(this.wholeText);
    }
    get textContent() {return this.wholeText}
    set textContent(value) {this.wholeText = value}
    get innerHTML() {return escapeHTML(this.wholeText)}
    set innerHTML(value) {this.wholeText = unescapeHTML(value)}
  }

  class CommentNode extends Element {
    constructor(value) {
      super(COMMENT_NODE);
      this.data = value;
    }

    cloneNode(deep) {
      return new CommentNode(this.data);
    }
    get textContent() {return this.data}
    set textContent(value) {this.data = value}
    get innerHTML() {return `<!--${escapeHTML(this.data)}-->`}
    set innerHTML(value) {this.data = unescapeHTML(value)}
  }

  const origCssText = style=>{
    if (style[needBuild$]) {
      style[needBuild$] = false;
      style[cssText$] = style.cssText;
    }
    return style[cssText$];
  };

  class Style {
    constructor(node) {
      this[styles$] = {};
      this[styleArray$] = [];
      this[pos$] = {};
      this[needBuild$] = true;
    }

    get length() {return this[styleArray$].length}

    item(index) {return this[styleArray$][index]}

    setProperty(dname, value='') {
      if (dname.slice(-5) === 'color')
        value = value && uColor.toRgbStyle(value);
      this[needBuild$] = true;
      const styles = this[styles$];
      const oldValue = styles[dname];
      if (oldValue === value) return;
      if (oldValue === undefined) {
        this[pos$][dname] = this[styleArray$].length;
        this[styleArray$].push(dname);
      }
      styles[dname] = value;
    }

    getPropertyValue(dname) {
      return this[styles$][dname];
    }

    removeProperty(dname) {
      const styles = this[styles$];
      if (styles[dname] !== undefined) {
        const poses = this[pos$];
        this[styleArray$].splice(poses[dname], 1);
        delete styles[dname];
        delete poses[dname];
        this[needBuild$] = true;
      }
    }

    get cssText() {
      const sm = this[styles$];
      return this[styleArray$].map(dname => {
        let value = sm[dname];
        if (dname === 'font-family' && value.indexOf(' ') !== -1)
          value = "'"+value+"'";
        return dname+": "+value+";";
      }).join(" ");
    }

    set cssText(cssText) {
      this[cssText$] = cssText;
      const sm = this[styles$] = {};
      const sa = this[styleArray$] = [];
      this[needBuild$] = false;
      const styles = cssText.split(/\s*;\s*/);
      for(let i = 0; i < styles.length; ++i) {
        const style = styles[i];
        if (! style) {
          styles.length = i;
          break;
        }
        const idx = style.indexOf(':');
        const dname = style.slice(0, idx);
        const name = util.camelize(dname);
        let value = style.slice(idx+1).trim();
        if (/color/.test(dname))
          value = (value && uColor.toRgbStyle(value)) || '';
        sm[dname] = sm[name] = value;
        sa.push(dname);
      }
    }
  }

  'text-align font-size font-family font-weight font-style text-decoration background-color color'
    .split(' ').forEach(dname => {
      const name = util.camelize(dname);
      function get() {return this[styles$][dname] || ''};
      function set(value) {this.setProperty(dname, value)};

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

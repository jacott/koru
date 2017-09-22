define(function(require, exports, module) {
  const koru = require('koru');
  const util = require('koru/util');

  const ATTRS = {id: true, class: true, style: true, xmlns: true};

  function Dom(cssQuery, parent=document.body) {
    return parent.querySelector(cssQuery);
  }

  const CANONICAL_TAG_NAMES = Dom.CANONICAL_TAG_NAMES = {
    div: 'div', DIV: 'div',
    br: 'br', BR: 'br',

    // svg
    svg: 'svg',
    foreignObject: 'foreignObject',
  };

  const canonicalTagName = Dom.canonicalTagName = elm => {
    const {tagName} = elm;
    const canon = CANONICAL_TAG_NAMES[tagName];
    if (canon !== undefined) return canon;
    const upperCase = tagName.toUpperCase();
    if (upperCase === tagName) {
      const lowerCase = tagName.toLowerCase();
      CANONICAL_TAG_NAMES[upperCase] = lowerCase;
      CANONICAL_TAG_NAMES[lowerCase] = lowerCase;
      return lowerCase;
    }

    return (CANONICAL_TAG_NAMES[tagName] = tagName);
  };

  const SVGNS = Dom.SVGNS = "http://www.w3.org/2000/svg";

  const HTML_IGNORE = {id: true, class: true, xmlns: true};

  const html = (body, xmlns) => {
    let content = null, tagName = '';

    if (typeof body === "string") {
      if (body.indexOf("\n") !== -1) {
        content = document.createDocumentFragment();
        body.split('\n').forEach(function (line, index) {
          index && content.appendChild(document.createElement('br'));
          line && content.appendChild(document.createTextNode(line));
        });
        return content;
      } else
        return document.createTextNode(body);
    }

    if (body.nodeType) return body;

    if (Array.isArray(body)) {
      const elm = document.createDocumentFragment();
      body.forEach(item => {
        item != null && elm.appendChild(html(item, xmlns));
      });
      return elm;
    }

    const comment = body.$comment$;
    if (comment !== undefined) return document.createComment(comment);

    const attrs = {};
    let pTag = '', ambig = false;

    if (body.xmlns !== undefined)
      xmlns = body.xmlns === "http://www.w3.org/1999/xhtml" ? undefined : body.xmlns;

    for(const key in body) {
      if (HTML_IGNORE[key]) continue;
      const value = body[key];
      if (key[0] === '$') {
        attrs[key.slice(1)] = value;
      } else if (tagName !== '') {
        attrs[key] = value;
      } else if (typeof value === 'string') {
        if (ATTRS[key]) {
          attrs[key] = value;
        } else if (pTag === '') {
          pTag = key; content = value;
        } else {
          ambig = true;
          attrs[key] = value;
        }
      } else {
        if (pTag !== '') {
          attrs[pTag] = content;
          pTag = '';
        }
        tagName = key;
        if (tagName === 'svg')
          xmlns = SVGNS;
        content = value && html(value, xmlns);
      }
    }

    if (pTag !== '') {
      if (ambig) {
        throw new Error('Ambiguous markup');
      }

      tagName = pTag;
      content = html(content, xmlns);
    }



    const elm = xmlns !== undefined ?
            document.createElementNS(SVGNS, tagName)
            : document.createElement(tagName||'div');
    canonicalTagName(elm);

    if (body.class !== undefined) elm.className = body.class;
    if (body.id !== undefined) elm.id = body.id;
    for(const key in attrs) {
      elm.setAttribute(key, attrs[key]);
    }

    content && elm.appendChild(content);

    return elm;
  };

  const htmlToJson = (node, ns="http://www.w3.org/1999/xhtml")=>{
    const {childNodes} = node;
    switch(node.nodeType) {
    case document.TEXT_NODE: return node.textContent;
    case document.ELEMENT_NODE:
      const tagName = canonicalTagName(node);
      const result = {};
      if (ns !== node.namespaceURI) {
        ns = node.namespaceURI;
        if (tagName !== 'svg')
          result.xmlns = ns;
      }
      let ambig = false;
      util.forEach(node.attributes, ({name, value}) => {
        if (! ATTRS[name]) ambig = true;
        result[name] = value;
      });
      switch(childNodes.length) {
      case 0:
        if (tagName !== 'div')
          result[tagName] = ambig ? [] : '';
        break;
      case 1: {
        const v = htmlToJson(node.firstChild, ns);
        result[tagName] = ambig && typeof v === 'string' ? [v] : v;
      } break;
      default:
        result[tagName] = util.map(childNodes, n => htmlToJson(n, ns));
      }
      return result;
    case document.DOCUMENT_FRAGMENT_NODE:
      return util.map(node.childNodes, n => htmlToJson(n, ns));
    case document.COMMENT_NODE:
      return {$comment$: node.data};
    }
  };

  const hasClass = (elm, name)=> elm == null || elm.classList === undefined
          ? false : elm.classList.contains(name);
  const addClass = (elm, name)=>{elm == null || elm.classList.add(name)};
  const removeClass = (elm, name)=>{elm == null || elm.classList.remove(name)};

  util.merge(Dom, {
    textToHtml(body, tagName='div') {
      const elm = document.createElement(tagName);
      elm.innerHTML = body;
      return elm.firstChild;
    },
    h: html,

    escapeHTML(text) {
      const pre = document.createElement('pre');
      pre.appendChild(document.createTextNode(text));
      return pre.innerHTML;
    },

    hasClass, addClass, removeClass,

    addClasses(elm, name) {
      if (elm != null) {
        const {classList} = elm;
        if (classList === undefined) return;
        for(let i = name.length - 1; i >= 0; --i)
          classList.add(name[i]);
      }
    },

    toggleClass: (elm, name)=>{
      if (elm != null) {
        const {classList} = elm;
        return classList.contains(name) ? (classList.remove(name), false)
          : (classList.add(name), true);
      }
    },

    nodeIndex(node) {
      const nodes = node.parentNode.childNodes;
      for (let count = nodes.length; count >= 0; --count) {
        if (node === nodes[count])
          return count;
      }
      return -1;
    },

    walkNode(node, visitor) {
      const childNodes = node.childNodes;
      const len = childNodes.length;

      for(let i = 0; i < len; ++i) {
        const elm = childNodes[i];
        switch(visitor(elm, i)) {
        case true: return true;
        case false: continue;
        default:
          if (this.walkNode(elm, visitor))
            return true;
        }
      }
    },

    htmlToJson,

    handleException(ex) {
      if (! (koru.globalErrorCatch && koru.globalErrorCatch(ex))) {
        koru.unhandledException(ex);
      }
    },
  });

  return Dom;
});

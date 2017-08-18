define(function(require, exports, module) {
  const koru = require('koru');
  const util = require('koru/util');

  const ATTRS = {id: true, class: true, style: true};

  function Dom(cssQuery, parent=document.body) {
    return parent.querySelector(cssQuery);
  }

  const SVGNS = Dom.SVGNS = "http://www.w3.org/2000/svg";

  const h = (body, xmlns) => {
    let id = '', className = '', content = null, tagName = '';

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
        item != null && elm.appendChild(h(item, xmlns));
      });
      return elm;
    }

    const comment = body.$comment$;
    if (comment !== undefined) return document.createComment(comment);

    const attrs = {};
    let pTag = '', ambig = false;

    for(const key in body) {
      const value = body[key];
      switch(key) {
      case "id": id = value; break;
      case "class": className = value; break;

      default:
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
          content = value && h(value, xmlns);
        }
        break;
      }
    }

    if (pTag !== '') {
      if (ambig) {
        throw new Error('Ambiguous markup');
      }

      tagName = pTag;
      content = h(content, xmlns);
    }

    const elm = xmlns === SVGNS ?
            document.createElementNS(SVGNS, tagName)
            : document.createElement(tagName||'div');
    if (className !== '') elm.className = className;
    if (id !== '') elm.id = id;
    for(const key in attrs) {
      elm.setAttribute(key, attrs[key]);
    }

    content && elm.appendChild(content);

    return elm;
  };

  const htmlToJson = node=>{
    const {childNodes} = node;
    switch(node.nodeType) {
    case document.TEXT_NODE: return node.textContent;
    case document.ELEMENT_NODE:
      const result = {};
      let ambig = false;
      util.forEach(node.attributes, ({name, value}) => {
        if (! ATTRS[name]) ambig = true;
        result[name] = value;
      });
      const tagName = node.tagName.toLowerCase();
      switch(childNodes.length) {
      case 0:
        if (tagName !== 'div')
          result[tagName] = ambig ? [] : '';
        break;
      case 1: {
        const v = htmlToJson(node.firstChild);
        result[tagName] = ambig && typeof v === 'string' ? [v] : v;
      } break;
      default:
        result[tagName] = util.map(childNodes, htmlToJson);
      }
      return result;
    case document.DOCUMENT_FRAGMENT_NODE:
      return util.map(node.childNodes, htmlToJson);
    case document.COMMENT_NODE:
      return {$comment$: node.data};
    }
  };

  util.merge(Dom, {
    html,
    h,

    escapeHTML(text) {
      const pre = document.createElement('pre');
      pre.appendChild(document.createTextNode(text));
      return pre.innerHTML;
    },

    hasClass(elm, name) {
      if (elm == null) return false;
      const classList = elm.classList;
      return classList === undefined ? false : classList.contains(name);
    },

    addClass(elm, name) {
      if (elm == null) return;
      const classList = elm.classList;
      classList === undefined || elm.classList.add(name);
    },

    addClasses(elm, name) {
      if (elm != null) {
        const classList = elm.classList;
        if (classList === undefined) return;
        for(let i = name.length - 1; i >= 0; --i)
          classList.add(name[i]);
      }
    },

    removeClass(elm, name) {
      if (elm == null) return;
      const classList = elm.classList;
      classList === undefined || elm.classList.remove(name);
    },

    toggleClass(elm, name) {
      if (elm == null) return;
      if (Dom.hasClass(elm, name)) {
        Dom.removeClass(elm, name);
        return false;
      }

      Dom.addClass(elm, name);
      return true;
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

  /**
   * Convert text to html
   **/
  function html(body, tagName) {
    tagName = tagName || 'div';
    if (typeof body === 'string') {
      const elm = document.createElement(tagName);
      elm.innerHTML = body;
      return elm.firstChild;
    }
  }

  return Dom;
});

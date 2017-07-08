define(function(require, exports, module) {
  const koru = require('koru');
  const util = require('koru/util');

  function Dom(cssQuery, parent=document.body) {
    return parent.querySelector(cssQuery);
  }

  const NO_DOLLAR = {id: true, class: true};

  const h = body => {
    let id = '', className = '', content = null, tagName = 'div', attrs = {};

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
        item != null && elm.appendChild(h(item));
      });
      return elm;
    }

    const comment = body.$comment$;
    if (comment !== undefined) return document.createComment(comment);


    for(const key in body) {
      const value = body[key];
      switch(key) {
      case "id": id = value; break;
      case "class": className = value; break;

      default:
        if (key[0] === '$') {
          attrs[key.slice(1)] = value;
        } else {
          tagName = key;
          content = value && h(value);
        }
        break;
      }
    }

    const elm = document.createElement(tagName);
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
      util.forEach(node.attributes, ({name, value}) => {
        result[NO_DOLLAR[name] ? name : `$${name}`] = value;
      });
      const tagName = node.tagName.toLowerCase();
      switch(childNodes.length) {
      case 0: break;
      case 1: result[tagName] = htmlToJson(node.firstChild); break;
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

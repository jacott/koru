define(function(require, exports, module) {
  const koru = require('koru');
  const util = require('koru/util');

  function Dom(cssQuery) {
    return document.body.querySelector(cssQuery);
  }

  util.extend(Dom, {
    html,
    h,

    escapeHTML(text) {
      var pre = document.createElement('pre');
      pre.appendChild(document.createTextNode(text));
      return pre.innerHTML;
    },

    hasClass (elm, name) {
      var classList = elm && elm.classList;
      return classList && classList.contains(name);
    },

    addClass (elm, name) {
      var classList = elm && elm.classList;
      classList && classList.add(name);
    },

    addClasses (elm, name) {
      var classList = elm && elm.classList;
      if (classList)
        for(var i = name.length - 1; i >= 0; --i)
          classList.add(name[i]);
    },

    removeClass (elm, name) {
      var classList = elm && elm.classList;
      classList && classList.remove(name);
    },

    toggleClass (elm, name) {
      if (! elm) return;
      if (Dom.hasClass(elm, name)) {
        Dom.removeClass(elm, name);
        return false;
      }

      Dom.addClass(elm, name);
      return true;
    },

    nodeIndex (node) {
      var nodes = node.parentNode.childNodes;
      for (var count = nodes.length; count >= 0; --count) {
        if (node === nodes[count])
          return count;
      }
      return -1;
    },

    handleException(ex) {
      if (! (koru.globalErrorCatch && koru.globalErrorCatch(ex))) {
        koru.unhandledException(ex);
      }
    },
  });


  /**
   * Convert an Object into a html node.
   *
   * id, class convert to attributes but other attributes must be
   * prefixed with a $.
   * Array is used when multiple children.
   * Non prefixed key is used for tagName.
   **/
  function h(body) {
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
      var elm = document.createDocumentFragment();
      body.forEach(function (item) {
        item && elm.appendChild(h(item));
      });
      return elm;
    }

    var id, className, content, tagName = 'div', attrs = {};
    for(var key in body) {
      var value = body[key];
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

    var elm = document.createElement(tagName);
    className && (elm.className = className);
    id && (elm.id = id);
    for(var key in attrs) {
      elm.setAttribute(key, attrs[key]);
    }

    content && elm.appendChild(content);

    return elm;
  }

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

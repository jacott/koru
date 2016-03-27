define(function(require, exports, module) {
  var util = require('koru/util');
  var koru = require('koru');

  function Dom(cssQuery) {
    return document.body.querySelector(cssQuery);
  }

  util.extend(Dom, {
    html: html,
    h: html2,

    escapeHTML: function(text) {
      var pre = document.createElement('pre');
      pre.appendChild(document.createTextNode(text));
      return pre.innerHTML;
    },

    hasClass: function (elm, name) {
      var classList = elm && elm.classList;
      return classList && classList.contains(name);
    },

    addClass: function (elm, name) {
      var classList = elm && elm.classList;
      classList && classList.add(name);
    },

    addClasses: function (elm, name) {
      var classList = elm && elm.classList;
      if (classList)
        for(var i = name.length - 1; i >= 0; --i)
          classList.add(name[i]);
    },

    removeClass: function (elm, name) {
      var classList = elm && elm.classList;
      classList && classList.remove(name);
    },

    toggleClass: function (elm, name) {
      if (! elm) return;
      if (Dom.hasClass(elm, name)) {
        Dom.removeClass(elm, name);
        return false;
      }

      Dom.addClass(elm, name);
      return true;
    },

    nodeIndex: function (node) {
      var nodes = node.parentNode.childNodes;
      for (var count = nodes.length; count >= 0; --count) {
        if (node === nodes[count])
          return count;
      }
      return -1;
    },

    handleException: function(ex) {
      if (! (koru.globalErrorCatch && koru.globalErrorCatch(ex))) {
        koru.unhandledException(ex);
      }
    },
  });


  function html2(body) {
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
        item && elm.appendChild(html2(item));
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
          content = value && html2(value);
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

  function html(body, tagName) {
    tagName = tagName || 'div';
    if (typeof body === 'string') {
      var elm = document.createElement(tagName);
      elm.innerHTML = body;
      return elm.firstChild;
    }

    if ('nodeType' in body) return body;

    if (Array.isArray(body)) {
      var elm = document.createDocumentFragment();
      body.forEach(function (item) {
        item && elm.appendChild(html(item));
      });
      return elm;
    }

    var id, className, content, attrs = {};
    for(var key in body) {
      var value = body[key];
      switch(key) {
      case "id": id = value; break;

      case "class": case "className": className = value; break;
      case "content": case "html": case "body":
        content = html(value);
        break;

      case "textContent": case "text":
        content = ''+value;
        if (content.indexOf("\n") !== -1) {
          value = content;
          content = document.createDocumentFragment();
          value.split('\n').forEach(function (line, index) {
            index && content.appendChild(document.createElement('br'));
            content.appendChild(document.createTextNode(line));
          });
        }
        break;

      case "tag": case "tagName": tagName = value; break;
      default:
        if (typeof value === 'object') {
          content = html(value, key);
        } else {
          attrs[key] = value;
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

    if (typeof content === "string")
      elm.textContent = content;
    else if (Array.isArray(content))
      content.forEach(function (item) {
        item && elm.appendChild(html(item));
      });
    else
      content && elm.appendChild(content);

    return elm;
  }

  return Dom;
});

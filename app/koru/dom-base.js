define(function(require, exports, module) {
  var util = require('koru/util');

  var Dom = {
    html: function (html, tagName) {
      tagName = tagName || 'div';
      if (typeof html === 'string') {
        var elm = document.createElement(tagName);
        elm.innerHTML = html;
        return elm.firstChild;
      }

      if ('nodeType' in html) return html;

      if (Array.isArray(html)) {
        var elm = document.createDocumentFragment();
        util.forEach(html, function (item) {
          elm.appendChild(Dom.html(item));
        });
        return elm;
      }

      var id, className, content, attrs = {};
      for(var key in html) {
        var value = html[key];
        switch(key) {
        case "id": id = value; break;

        case "class": case "className": className = value; break;
        case "content": case "html":
          content = typeof value === 'string' ? Dom.html(value) : value;
          break;
        case "textContent": case "text": content = ''+value; break;

        case "tag": case "tagName": tagName = value; break;
        default:
          if (typeof value === 'object') {
            content = Dom.html(value, key);
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
        util.forEach(content, function (item) {
          elm.appendChild(Dom.html(item));
        });
      else
        content && elm.appendChild(content);

      return elm;
    },

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
  };

  return Dom;
});

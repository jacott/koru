define(function(require, exports, module) {
  require('./html-doc');
  var Dom = require('koru/dom-base');
  var util = require('koru/util');

  var TEXT_NODE = document.TEXT_NODE;

  var TO_HTML = {
    p: 'div',
    b: 'b',
    i: 'i',
    u: 'u',
  };

  var FROM_HTML = {
    div: 'p',
    br: 'br',
    ol: 'ol',
    ul: 'ul',
    li: 'li',
    p: 'p',
    b: 'b',
    i: 'i',
    u: 'u',
  };

  var INLINE_TAGS = {
    B: 'inline',
    U: 'inline',
    I: 'inline',
    A: 'inline',
    SPAN: 'inline',
  };

  return {
    toHtml: html,

    fromHtml: fromHtml,

    INLINE_TAGS: INLINE_TAGS,
  };

  function isInlineNode(item) {
    return item.nodeType === TEXT_NODE || INLINE_TAGS[item.tagName];
  }

  function html(body) {
    if (typeof body === "string") {
      if (body.indexOf("\n") !== -1) {
        content = document.createDocumentFragment();
        body.split('\n').forEach(function (line) {
          var elm = document.createElement('div');
          if (line)
            elm.textContent = line;
          else
            elm.appendChild(document.createElement('br'));
          content.appendChild(elm);
        });
        return content;
      } else
        return document.createTextNode(body);
    }

    if (Array.isArray(body)) {
      var elm = document.createDocumentFragment();
      var last;
      body.forEach(function (item) {
        if (! item) return;
        item = html(item);
        if (last && isInlineNode(item) &&
            ! isInlineNode(last)) {
          last = item;
          item = document.createElement('div');
          item.appendChild(last);
        }
        elm.appendChild(item);
        last = item;
      });

      if (elm.childNodes.length > 1 && elm.firstChild.nodeType === TEXT_NODE && ! isInlineNode(elm.childNodes[1])) {
        last = document.createElement('div');
        last.appendChild(elm.firstChild);
        elm.insertBefore(last, elm.firstChild);
      }

      return elm;
    }

    var id, className, content, tagName = 'div', attrs = {};
    for(var key in body) {
      var value = body[key];
      if (TO_HTML[key]) {
        tagName = TO_HTML[key];
        content = value && html(value);
      } else switch(key) {
      case "id": id = value; break;

      case "class": className = value; break;

      default:
        if (key[0] === '$') {
          attrs[key.slice(1)] = value;
        } else {
          tagName = key;
          if (value)
            content = html(value);
          else if (! INLINE_TAGS[key.toUpperCase()]) {
            content = document.createElement('br');
          }
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

  function fromHtml(dom) {
    if (dom.nodeType === TEXT_NODE)
      return dom.textContent;

    var result = {};

    var tag = dom.tagName.toLowerCase();
    tag = FROM_HTML[tag] || 'p';

    var nodes = dom.childNodes;
    switch(nodes.length) {
    case 1:
      if (nodes[0].nodeType === TEXT_NODE) {
        if (tag === 'p')
          return nodes[0].textContent;
        result[tag] = nodes[0].textContent;
      } else if (tag === 'p' && nodes[0].tagName === 'BR')
        return "";
      else {
        result[tag] = fromHtml(nodes[0]);
      }
    case 0:
      break;
    default:
      var content = [];
      var textString = [];
      util.forEach(nodes, function (node) {
        if (node.nodeType === TEXT_NODE) {
          textString.push(node.textContent);
        } else {
          var sub = fromHtml(node);
          if (typeof sub === 'string') {
            if (textString.length)
              textString.push('\n');
            textString.push(sub);
          } else {
            if (textString.length) {
              content.push(textString.join(''));
              textString.length = 0;
            }

            content.push(fromHtml(node));
          }
        }
      });
      textString.length && content.push(textString.join(''));
      if (content.length === 1 && typeof content[0] === 'string')
        result[tag] = content[0];
      else
        result[tag] = content;
    }

    return result;
  }
});

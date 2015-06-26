define(function(require, exports, module) {
  var util = require('../util');
  var koru = require('../main');
  var Dom = require('../dom');
  var $ = Dom.current;

  var output;


  Dom.registerHelpers({
    setTextAsHTML: function (content) {
      var elm = $.element;
      Dom.removeChildren(elm);
      elm.appendChild(exports.toHtml(content));
    },
  });

  return exports = {
    fromHtml: function (html) {
      output = [];
      html && outputChildNodes(html);
      var result = output.join('').trim();
      output = null;
      return result;
    },

    toHtml: function (text, wrapper) {
      var frag = wrapper ? (typeof wrapper === 'string' ? document.createElement(wrapper) : wrapper) : document.createDocumentFragment();
      var first = true;
      util.forEach(text.split('\n'), function (line) {
        if (first)
          first = false;
        else frag.appendChild(document.createElement('br'));
        frag.appendChild(document.createTextNode(line));
      });
      return frag;
    },
  };

  function fromHtml(html) {
    switch(html.nodeType) {
    case document.TEXT_NODE:
      output.push(html.textContent.replace(/\xa0/g, ' '));
      break;
    case document.ELEMENT_NODE:
      switch(html.tagName) {

      case 'BR':
        if (! (html.parentNode && html.parentNode.lastChild === html))
          output.push('\n');
        break;

      case 'DIV':
        output.push('\n');
        if (html.firstChild && html.firstChild.tagName === 'BR' && html.firstChild === html.lastChild) {
        } else {
          outputChildNodes(html);
        }
        break;
      case 'P':
        output.push('\n\n');
        outputChildNodes(html);
        break;
      default:
        outputChildNodes(html);
        break;
      }
    }
  }

  function outputChildNodes(html) {
    var children = html.childNodes;

    for(var i = 0; i < children.length; ++i) {
      var row = children[i];
      fromHtml(row);
    }
  }
});

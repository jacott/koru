define(function(require, exports, module) {
  var util = require('../util');
  var koru = require('../main');
  var Dom = require('../dom');
  var $ = Dom.current;
  var Tpl = Dom.newTemplate(module, require('koru/html!./plain-text'));
  var EditorCommon = require('./editor-common');

  var output;

  Dom.registerHelpers({
    setTextAsHTML: function (content) {
      exports.setTextAsHTML($.element, content);
    },

    planTextEditor: function (content, options) {
      return Tpl.$autoRender({content: content, options: options});
    },
  });

  Tpl.$extend({
    $created: function (ctx, elm) {
      exports.setTextAsHTML(elm, ctx.data.content);

      EditorCommon.addAttributes(elm, ctx.data.options);

      Object.defineProperty(elm, 'value', {
        get: function () {
          var value = exports.fromHtml(elm);
          return value;
        },
        set: function (value) {
          exports.setTextAsHTML(elm, value);
        },
      });
    },

    insert: EditorCommon.insert,
  });

  Tpl.$events({
    'keydown': function (event) {
      if (event.ctrlKey) switch(event.which) {
      case 66: case 85: case 73:
        Dom.stopEvent();
        break;
      }
    },

    'paste': function (event) {
      if ('clipboardData' in event) {
        var types = event.clipboardData.types;
        if (types) for(var i = 0; i < types.length; ++i) {
          var type = types[i];
          if (/html/.test(type)) {
            var md = exports.fromHtml(Dom.html('<div>'+event.clipboardData.getData(type)+'</div>'));
            if (Tpl.insert(exports.toHtml(md)) || Tpl.insert(md))
              Dom.stopEvent();
            return;
          }
        }
      }
    },
  });

  return exports = {
    Editor: Tpl,

    setTextAsHTML: function (elm, content) {
      Dom.removeChildren(elm);
      elm.appendChild(exports.toHtml(content));
    },

    fromHtml: function (html) {
      output = [];
      html && outputChildNodes(html);
      var result = output.join('').trim();
      output = null;
      return result;
    },

    toHtml: function (text, wrapper) {
      text = text || '';
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

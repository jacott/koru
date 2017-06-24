define(function(require, exports, module) {
  const Dom          = require('../dom');
  const koru         = require('../main');
  const util         = require('../util');
  const EditorCommon = require('./editor-common');

  const $ = Dom.current;
  const Tpl = Dom.newTemplate(module, require('koru/html!./plain-text'));
  let output;

  Dom.registerHelpers({
    setTextAsHTML(content) {
      exports.setTextAsHTML($.element, content);
    },
  });

  Tpl.$extend({
    $created(ctx, elm) {
      exports.setTextAsHTML(elm, ctx.data.content);

      EditorCommon.addAttributes(elm, ctx.data.options);

      Object.defineProperty(elm, 'value', {
        get() {return exports.fromHtml(elm)},
        set(value) {exports.setTextAsHTML(elm, value)},
      });
    },

    insert: EditorCommon.insert,
  });

  Tpl.$events({
    'keydown'(event) {
      if (event.ctrlKey) switch(event.which) {
      case 66: case 85: case 73:
        Dom.stopEvent();
        break;
      }
    },

    'paste'(event) {
      const cb = event.clipboardData;
      if (cb) {
        const text = event.clipboardData.getData('text/html');
        if (text) {
          const md = exports.fromHtml(Dom.html('<div>'+text+'</div>'));
          if (Tpl.insert(exports.toHtml(md)) || Tpl.insert(md))
            Dom.stopEvent();
          return;
        }
      }
    },
  });

  return exports = {
    Editor: Tpl,

    setTextAsHTML(elm, content) {
      Dom.removeChildren(elm);
      elm.appendChild(exports.toHtml(content));
    },

    fromHtml(html) {
      output = [];
      html && outputChildNodes(html);
      const result = output.join('').trim();
      output = null;
      return result;
    },

    toHtml(text, wrapper) {
      text = text || '';
      const frag = wrapper ? (typeof wrapper === 'string' ?
                            document.createElement(wrapper) : wrapper)
          : document.createDocumentFragment();
      let first = true;
      util.forEach(text.split('\n'), line => {
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
    const children = html.childNodes;

    for(let i = 0; i < children.length; ++i) {
      fromHtml(children[i]);
    }
  }
});

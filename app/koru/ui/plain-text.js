define((require, exports, module)=>{
  const Dom             = require('../dom');
  const koru            = require('../main');
  const util            = require('../util');
  const EditorCommon    = require('./editor-common');

  const $ = Dom.current;
  const Tpl = Dom.newTemplate(module, require('koru/html!./plain-text'));
  let output;

  Dom.registerHelpers({
    setTextAsHTML(content) {
      PlainText.setTextAsHTML($.element, content);
    },
  });

  Tpl.$extend({
    $created(ctx, elm) {
      PlainText.setTextAsHTML(elm, ctx.data.content);

      EditorCommon.addAttributes(elm, ctx.data.options);

      Object.defineProperty(elm, 'value', {
        get() {return PlainText.fromHtml(elm)},
        set(value) {PlainText.setTextAsHTML(elm, value)},
      });
    },

    insert: EditorCommon.insert,
  });

  const pasteFilter = event=>{
    const cb = event.clipboardData;
    if (cb) {
      const text = event.clipboardData.getData('text/html');
      if (text) {
        const md = PlainText.fromHtml(Dom.textToHtml(`<div>${text}</div>`));
          if (Tpl.insert(PlainText.toHtml(md)) || Tpl.insert(md))
            Dom.stopEvent();
        return;
      }
    }
  };

  Tpl.$events({
    'keydown'(event) {
      if (event.ctrlKey) switch(event.which) {
      case 66: case 85: case 73:
        Dom.stopEvent();
        break;
      }
    },

    'paste': pasteFilter,
  });


  const fromHtml = html =>{
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
  };

  const outputChildNodes = html =>{
    const children = html.childNodes;

    for(let i = 0; i < children.length; ++i) {
      fromHtml(children[i]);
    }
  };

  const PlainText = {
    Editor: Tpl,

    pasteFilter,

    buildKeydownEvent({cancel, okay}) {
      return function (event) {
        switch (event.which) {
        case 66: case 85: case 73:
          if (event.ctrlKey) Dom.stopEvent();
          break;
        case 27:
          cancel(this);
          return;
        case 13:
          Dom.stopEvent();
          okay(this);
          return;
        }
      };
    },

    setTextAsHTML(elm, content) {
      Dom.removeChildren(elm);
      elm.appendChild(PlainText.toHtml(content));
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

  return PlainText;
});

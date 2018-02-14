define(function(require, exports, module) {
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const makeSubject     = require('koru/make-subject');
  const util            = require('koru/util');
  const uColor          = require('koru/util-color');
  const session         = require('../session/client-rpc');
  const ColorPicker     = require('./color-picker');
  const KeyMap          = require('./key-map');
  const Modal           = require('./modal');
  const RichText        = require('./rich-text');
  const RichTextMention = require('./rich-text-mention');
  const SelectMenu      = require('./select-menu');

  const Tpl = module.exports = Dom.newTemplate(module, require('koru/html!./rich-text-editor'));
  const $ = Dom.current;
  const {Link} = Tpl;

  let languageList;

  const {TEXT_NODE} = document;

  const BR = document.createElement('br');

  const {INLINE_TAGS, FONT_SIZE_TO_EM} = RichText;

  const {shift, ctrl, meta} = KeyMap;

  const EMPTY_PRE = Dom.h({pre: {div: BR.cloneNode()}, 'data-lang': 'text'});

  const FONT_LIST = RichText.standardFonts.map(
    (name, id) => [
      id, Dom.h({font: util.capitalize(util.humanize(name)), $face: RichText.fontIdToFace[id]})]);

  const FONT_SIZE_LIST = [
    [1, 'X small'],
    [2, 'Small'],
    [3, 'Medium'],
    [4, 'Large'],
    [5, 'X large'],
    [6, 'XX large'],
    [7, 'XXX large'],
  ];

  FONT_SIZE_LIST.forEach(row => {
    row[1] = Dom.h({font: row[1], $size: row[0]});
  });

  execCommand('styleWithCSS', true);

  const actions = commandify({
    bold: true,
    italic: true,
    underline: true,
    insertOrderedList: true,
    insertUnorderedList: true,
    outdent: true,
    indent: true,
    justifyLeft: true,
    justifyCenter: true,
    justifyRight: true,
    justifyFull: true,
    removeFormat: true,
    fontName(event) {
      chooseFromMenu(event, {list: FONT_LIST}, function (ctx, id) {
        execCommand('fontName', RichText.fontIdToFace[id]);
        if (Dom.getRange().collapsed)
          return {font: id};
      });
    },
    fontColor(event) {
      const range = Dom.getRange();
      let node = range.endContainer;
      if (node && node.nodeType === TEXT_NODE)
        node = node.parentNode;
      if (! node) return;

      const ctx = Tpl.$ctx(event.target);
      const focus = ctx.inputElm;

      const style = window.getComputedStyle(node);

      let fgColor = uColor.toRGB(style.color);
      let bgColor = style.backgroundColor;
      bgColor = uColor.toRGB(bgColor === 'transparent' ? 'rgba(0,0,0,0)' : bgColor);

      fgColor = fgColor.a < .1 ? "#ffffff" : uColor.rgb2hex(fgColor);
      bgColor = bgColor.a < .1 ? "#ffffff" : uColor.rgb2hex(bgColor);

      const options = {foreColor: fgColor, hiliteColor: bgColor};
      const typeElm = Tpl.FontColor.$autoRender(options);

      ctx.openDialog = true;
      ColorPicker.choose(fgColor, {customFieldset: typeElm}, function (color) {
        ctx.openDialog = false;
        focus.focus();
        Dom.setRange(range);
        if (color === 'removeHilite') {
          execCommand('hiliteColor', 'initial');
          return;
        }
        const cmd = typeElm.getAttribute('data-mode');
        color && execCommand(cmd, color);
      });
    },
    fontSize(event) {
      chooseFromMenu(event, {list: FONT_SIZE_LIST}, function (ctx, id) {
        execCommand('fontSize', +id);
        if (Dom.getRange().collapsed)
          return {fontSize: id};
      });
    },
    code(event) {
      const range = Dom.getRange();
      const sc = range.startContainer;
      const ec = range.endContainer;
      const collapsed = range.collapsed;

      const editor = Dom.getClosest(sc, '.input');
      if (! editor) return;

      let _code;

      const ctx = Dom.myCtx(editor.parentNode);

      if (sc.nodeType === TEXT_NODE && ((_code = codeNode(editor, range)) || ec === sc)) {
        const font = _code ? 'initial': 'monospace';
        execCommand('fontName', font);
        notify(ctx, 'force', collapsed && {font: font});
      } else {
        Tpl.insert(
          collapsed ? EMPTY_PRE.cloneNode(true) :
            RichText.fromToHtml(Dom.h({pre: range.extractContents()})).firstChild);
        ctx.mode = codeMode;
        ensureLangues(ctx);
        notify(ctx, 'force');
      }
    },
    link() {
      const aElm = getTag('A');
      const range = Dom.selectElm(aElm) || Dom.getRange();
      if (! range) return;

      const inputCtx = Tpl.$ctx();
      const dialog = Link.$autoRender({
        range: range,
        elm: aElm,
        link: aElm == null ? '' : aElm.getAttribute('href'),
        text: range.toString() || '',
        inputCtx: inputCtx,
        inputElm: inputCtx.inputElm,
      });
      Modal.appendBelow({
        container: dialog,
        handleTab: true,
        boundingClientRect: Dom.getRangeClientRect(range),
      });
      dialog.querySelector('[name=link]').focus();
    },
    mention(event) {
      const range = Dom.getRange();
      if (! range) return;

      const button = event.target;
      const dialog = RichTextMention.$autoRender({
        range: range,
        type: button.getAttribute('data-type'),
        mentions: $.ctx.parentCtx.data.extend.mentions,
        inputCtx: $.ctx.parentCtx,
        value: range.toString(),
        inputElm: Tpl.$ctx(range.startContainer).inputElm,
      });

      Modal.append('on', {
        container: dialog,
        handleTab: true,
        boundingClientRect: Dom.getRangeClientRect(range),
      });
      dialog.getElementsByTagName('input')[0].focus();
    },
  });

  const mapActions = (keys, actions)=>{
    for (const name in keys) {
      keys[name] = [keys[name], actions[name]];
    }
    return keys;
  };

  const keyMap = KeyMap(mapActions({
    bold: ctrl+'B',
    italic: ctrl+'I',
    underline: ctrl+'U',
    insertOrderedList: ctrl+shift+'7',
    insertUnorderedList: ctrl+shift+'8',
    outdent: ctrl+'Û',
    indent: ctrl+'Ý',
    link: ctrl+'K',
    code: ctrl+'À',
    justifyLeft: ctrl+shift+"L",
    justifyCenter: ctrl+shift+"E",
    justifyRight: ctrl+shift+"R",
    justifyFull: ctrl+shift+"J",
    removeFormat: ctrl+'Ü',
    fontColor: ctrl+shift+'H',
    fontName: ctrl+shift+'O',
  }, actions), {mapCtrlToMeta: true});

  function chooseFromMenu(event, options, onSelect) {
    const ctx = Tpl.$ctx(event.target);
    const origin = event.target;

    options = Object.assign({
      onSelect(item) {
        const id = $.data(item)._id;

        // close dialog before notify to restore range
        Dom.remove(Dom.getClosest(item, '.glassPane'));
        notify(ctx, 'force', onSelect(ctx, id));
      },
      onClose() {
        ctx.openDialog = null;
      }
    }, options);

    options.boundingClientRect = ctx.inputElm.contains(event.target) ?
      Dom.getRangeClientRect(Dom.getRange()) :
      event.target.getBoundingClientRect();

    ctx.openDialog = true;
    SelectMenu.popup(event.target, options);
  }

  const codeActions = commandify({
    language(event) {
      chooseFromMenu(event, {
        search: SelectMenu.nameSearch,
        list: languageList,
      }, function (ctx, id) {
        const pre = Dom.getClosest(ctx.lastElm, 'pre');
        pre && pre.setAttribute('data-lang', id);
        codeMode.language = id;
      });
    },
    syntaxHighlight(event) {
      const ctx = Tpl.$ctx(event.target);
      const pre = Dom.getClosest(ctx.lastElm, 'pre');
      Dom.addClass(ctx.inputElm.parentNode, 'syntaxHighlighting');
      const rt = RichText.fromHtml(pre, {includeTop: true});
      session.rpc('RichTextEditor.syntaxHighlight', pre.getAttribute('data-lang'), rt[0].replace(/^.*\n/,''), function (err, result) {
        Dom.removeClass(ctx.inputElm.parentNode, 'syntaxHighlighting');
        if (err) return koru.globalCallback(err);
        result[2] = rt[1][2];
        if (util.deepEqual(result, rt[1]))
          return;
        const html = RichText.toHtml(rt[0], result);
        const range = document.createRange();
        if (Dom.vendorPrefix === 'moz') {
          range.selectNode(pre);
          Dom.setRange(range);
          execCommand('insertHTML', html.firstChild.outerHTML);
        } else {
          range.selectNodeContents(pre);
          Dom.setRange(range);
          execCommand('insertHTML', html.firstChild.innerHTML);
          const innerDiv = pre.firstChild.firstChild;
          if (innerDiv && innerDiv.tagName === 'DIV' && innerDiv.nextSibling)
            execCommand('forwardDelete');
        }
        setMode(ctx, Dom.getRange());
      });
    },
    bold: false,
    italic: false,
    underline: false,
    nextSection(event) {
      const elm = getModeNode($.ctx, Dom.getRange().endContainer);
      if (! elm) return;
      const nextElm = elm.nextSibling;
      const range = document.createRange();
      if (nextElm) {
        normPos($.ctx.inputElm, range, elm.nextSibling, 0, 'setEnd');
        range.collapse();
        Dom.setRange(range);
      } else {
        const temp = document.createTextNode("\xa0");
        elm.parentNode.appendChild(temp);
        range.setEnd(temp, 0);
        range.collapse();
        Dom.setRange(range);
        execCommand('insertHTML', '<div><br></div>');
        temp.remove();
      }
    },
    previousSection() {
      const elm = getModeNode($.ctx, Dom.getRange().endContainer);
      if (! elm) return;
      const previousElm = elm.previousSibling;
      const range = document.createRange();
      if (previousElm) {
        normPos($.ctx.inputElm, range, elm.previousSibling, 0, 'setStart');
        range.collapse(true);
        Dom.setRange(range);
      } else {
        const temp = document.createTextNode("\xa0");
        elm.parentNode.insertBefore(temp, elm);
        range.setEnd(temp, 0);
        range.collapse();
        Dom.setRange(range);
        execCommand('insertHTML', '<div><br></div>');
        temp.remove();
      }
    },
    newline() {
      execCommand('insertText', '\n');
    },
  });

  const codeKeyMap = KeyMap(mapActions({
    language: ctrl+'L',
    bold: ctrl+'B',
    italic: ctrl+'I',
    underline: ctrl+'U',
    nextSection: ctrl+KeyMap.down,
    previousSection: ctrl+KeyMap.up,
    syntaxHighlight: ctrl+shift+'H',
    newline: "\x0d",
  }, codeActions), {mapCtrlToMeta: true});

  function noop() {}

  function commandify(func, cmd) {
    switch(typeof func) {
    case 'function':
      return function (event) {
        return func.call(null, event, cmd);
      };
    case 'boolean':
      return func ? function (event) {
        execCommand(cmd);
        const ctx = Tpl.$ctx(event.target);
        notify(ctx, 'force', {});
      } : noop;
    }
    for (cmd in func) {
      func[cmd] = commandify(func[cmd], cmd);
    }
    return func;
  }

  const optionKeys = {
    type: true,
    focusout: true,
  };

  Tpl.$helpers({
    attrs() {
      const elm = $.element;
      const {options} = this;
      for (let id in options) {
        if (optionKeys[id] || id[0] === '$') continue;
        (id === 'placeholder' ?
         $.ctx.inputElm : elm)
          .setAttribute(id, options[id]);
      }
      Dom.addClass(elm, 'richTextEditor');
    },
  });

  function getHtml() {
    return Dom.myCtx(this).inputElm.cloneNode(true);
  }

  function setHtml(value) {
    const {inputElm} = Dom.myCtx(this);
    Tpl.clear(inputElm);
    value && inputElm.appendChild(value);
  }

  function focusInput(event) {
    const focusout = event.type === 'focusout';

    const elm = event.currentTarget;

    if (focusout) {
      if (currentDialog(elm))
        return;
      const pCtx = Dom.myCtx(elm.parentNode);
      if (! pCtx) return;
      const data = pCtx.data;
      data.options.focusout && data.options.focusout.call(elm, event);
    } else {
      const ctx = Tpl.$ctx(elm);
      if (! ctx) return;
      let range = Dom.getRange();
      if (! range || ! elm.contains(range.endContainer)) {
        range = document.createRange();
        range.selectNodeContents(elm);
        range.collapse(true);
        normRange(elm, range);
        Dom.setRange(range);
      }
      ctx && ctx.lastElm === undefined &&
        setMode(ctx, Dom.getRange());
      execCommand('styleWithCSS', true);
    }
    Dom.setClass('focus', ! focusout, elm.parentNode);
  }

  function currentDialog(me) {
    const ctx = Dom.myCtx(me.parentNode);
    return ctx && ctx.openDialog;
  }

  const standardMode = {
    actions: actions,
    type: 'standard',

    keyMap: keyMap,

    paste(htmlText) {
      const html = RichText.fromToHtml(Dom.textToHtml(`<div>${htmlText}</div>`));
      Tpl.insert(html, 'inner') || Tpl.insert(RichText.fromHtml(html)[0]);
    },

    pasteText(text) {
      const URL_RE = /(\bhttps?:\/\/\S+)/;

      if (Tpl.handleHyperLink && URL_RE.test(text)) {
        const html = document.createElement('DIV');
        text.split(/(\r?\n)/).forEach(function (line, oi) {
          if (oi % 2) {
            html.appendChild(document.createElement('BR'));
          } else {
            line.split(URL_RE).forEach(function (part, index) {
              if (index % 2) {
                const elm = Tpl.handleHyperLink(part);
                if (elm) {
                  html.appendChild(elm);
                  return;
                }
              }
              html.appendChild(document.createTextNode(part));
            });
          }
        });
        Tpl.insert(RichText.fromToHtml(html), 'inner') || Tpl.insert(text);
        return;
      }

      Tpl.insert(text);
    },

    keydown(event) {
      if (event.ctrlKey || event.metaKey) {
        keyMap.exec(event, 'ignoreFocus');
        return;
      }

      if ($.ctx.mentionState != null && $.ctx.mentionState < 3 &&
          ++$.ctx.mentionState > 2) {
        // we had a non printable key pressed; abort mention
        RichTextMention.revertMention(this);
      }
    },
  };

  const codeMode = {
    actions: codeActions,
    type: 'code',

    keyMap: codeKeyMap,

    keydown(event) {
      codeKeyMap.exec(event, 'ignoreFocus');
    },

    paste(htmlText) {
      const html = RichText.fromToHtml(Dom.textToHtml(`<pre><div>${htmlText}</div></pre>`));
      Tpl.insert(html.firstChild.firstChild, 'inner') ||
        Tpl.insert(RichText.fromHtml(html)[0].join("\n"));
    },
  };

  const modes = {
    standard: standardMode,
    code: codeMode,
  };

  Tpl.$extend({
    $created(ctx, elm) {
      Object.defineProperty(elm, 'value', {configurable: true, get: getHtml, set: setHtml});
      ctx.inputElm = elm.lastChild;
      ctx.caretMoved = makeSubject({});
      ctx.inputElm.addEventListener('focusin', focusInput);
      ctx.inputElm.addEventListener('focusout', focusInput);
      ctx.mode = standardMode;

      ctx.data.content && ctx.inputElm.appendChild(ctx.data.content);
    },

    $destroyed(ctx) {
      ctx.inputElm.addEventListener('focusin', focusInput);
      ctx.inputElm.addEventListener('focusout', focusInput);
      Dom.remove(ctx.selectItem);
    },

    title(title, action, mode) {
      return modes[mode].keyMap.getTitle(title, action);
    },

    clear(elm) {
      if (! Dom.hasClass(elm, 'richTextEditor'))
        elm = elm.parentNode;
      const ctx = Dom.ctx(elm);
      const input = ctx.inputElm;
      input.setAttribute('contenteditable', 'false');
      input.textContent = '';
      input.setAttribute('contenteditable', 'true');
      Dom.remove(ctx.selectItem);
    },

    moveLeft(editor, mark) {
      const range = select(editor, 'char', -1);
      if (! range) return;
      if (! mark) {
        range.collapse(true);
      }
      Dom.setRange(range);
    },

    select: select,
    execCommand: execCommand,
    getTag: getTag,
    findContainingBlock: findContainingBlock,
    firstInnerMostNode: firstInnerMostNode,
    lastInnerMostNode: lastInnerMostNode,

    insert(arg, inner) {
      const range = Dom.getRange();

      if (typeof arg === 'string')
        return execCommand('insertText', arg);

      let t;
      if (arg.nodeType === document.DOCUMENT_FRAGMENT_NODE) {
        t = document.createElement('div');
        t.appendChild(arg);
        t = t.innerHTML;
      } else if (inner) {
        t = arg.innerHTML;
      } else {
        t = arg.outerHTML;
      }
      return execCommand("insertHTML", t);
    },

    get languageList() {
      return languageList;
    },

    set languageList(value) {
      languageList = value;
      Tpl.languageMap = {};
      value && value.forEach(function (lang) {
        Tpl.languageMap[lang[0]] = lang[1];
      });

    },

    modes: modes,
  });

  Tpl.$events({
    input(event) {
      const input = event.target;
      const fc = input.firstChild;
      if (fc && fc === input.lastChild && input.firstChild.tagName === 'BR')
        fc.remove();

      util.forEach(input.querySelectorAll('BLOCKQUOTE[style],SPAN'), function (node) {
        switch (node.tagName) {
        case 'BLOCKQUOTE':
          node.removeAttribute('style');
          break;
        case 'SPAN':

          const st = node.style;
          const fs = st.fontSize;
          if (fs && fs.slice(-2) !== 'em') {
            st.fontSize = FONT_SIZE_TO_EM[fs.replace(/^-[a-z]+-/,'')] || '3em';
            st.lineHeight = "1em";
          }
          break;
        }
      });
    },

    paste(event) {

      let foundText, type;
      const cb = event.clipboardData;
      if (! cb) return;

      let text = event.clipboardData.getData('text/html');
      if (text) {
        Dom.stopEvent();
        $.ctx.mode.paste(text);
        return;
      }
      // safari does not appear to show html but does show rtf
      if (text = event.clipboardData.getData('public.rtf')) {
        return; // don't know what to do with rtf
      }
      if ($.ctx.mode.pasteText) {
        text = event.clipboardData.getData('text/plain');
        if (text) {
          Dom.stopEvent();
          $.ctx.mode.pasteText(text);
        }
      }
    },

    pointerup() {
      const range = Dom.getRange();
      $.ctx.override = null;
      range && setMode($.ctx, range);
    },

    'click a,button'(event) {
      event.preventDefault();
    },

    keydown(event) {
      const mdEditor = this.parentNode;

      switch(event.which) {
      case 229: case 16:
        return;
      }

      if (event.shiftKey) {
        if (event.which === 13) {
          Dom.stopEvent(event);
          return;
        }
      }

      $.ctx.mode.keydown.call(this, event);
    },

    keypress(event) {
      if (event.which === 0) return; // for firefox
      const ctx = $.ctx;

      if (ctx.mentionState != null && ctx.mentionState < 3) {
        Dom.stopEvent();
        const ch = String.fromCharCode(event.which);
        const range = Dom.getRange();
        const span = Dom.h({class: 'ln', span: ch});
        range.insertNode(span);
        ctx.mentionState = 3;
        ctx.selectItem = RichTextMention.selectItem({
          type: ctx.mentionType,
          mentions: ctx.data.extend.mentions,
          inputCtx: ctx,
          inputElm: ctx.inputElm,
          span: span,
        });
        return;
      }
      const mentionType = mentionKey(ctx, event.which);
      if (mentionType && event.shiftKey) {
        ctx.mentionType = mentionType;
        const range = Dom.getRange();
        if (range.startOffset !== 0) {
          let text;
          if (range.startContainer.nodeType === document.TEXT_NODE) {
            text = range.startContainer.textContent;
            text = text[range.startOffset - 1];
          } else {
            text = range.startContainer.childNodes[range.startOffset - 1].textContent;
          }
          if (text.match(/\S/)) return;
        }
        ctx.mentionState = 1;
        return;
      }
    },

    keyup() {
      const {ctx} = $;
      if (ctx.selectItem && ! $.data(ctx.selectItem).span.parentNode) {
        Dom.remove(ctx.selectItem);
      }
      const range = Dom.getRange();
      range == null || setMode(ctx, range);
    },
  });

  function getModeNode(ctx, elm) {
    for(const editor = ctx.inputElm; elm && elm !== editor; elm = elm.parentNode) {
      switch (elm.tagName) {
      case 'PRE':
        return elm;
      }
    }
  }

  function setMode(ctx, range) {
    let elm = range.endContainer;
    if (elm === ctx.lastElm) {
      if (! ctx.override || (range.collapsed && ctx.lastOffset === range.endOffset))
      return;
    }
    elm = getModeNode(ctx, elm);
    switch (elm && elm.tagName) {
    case 'PRE':
      ctx.mode = codeMode;
      codeMode.language = elm.getAttribute('data-lang') || 'text';
      ensureLangues(ctx);
      break;
    default:
      ctx.mode = standardMode;
    }
    notify(ctx);
  }

  function ensureLangues(ctx) {
    if (languageList) return;
    session.rpc('RichTextEditor.fetchLanguages', function (err, result) {
      Tpl.languageList = result;
      notify(ctx, 'force');
    });
  }

  function notify(ctx, force, override) {
    const range = Dom.getRange();
    const elm = range.endContainer.nodeType !== TEXT_NODE ?
            range.endContainer.childNodes[range.endContainer.offset] || range.endContainer
            : range.endContainer;

    if (! force && ctx.lastElm === elm &&
        (! ctx.override || (range.collapsed && ctx.lastOffset === range.endOffset)))
      return;

    ctx.override = override;
    ctx.lastElm = elm;
    ctx.lastOffset = range.endOffset;

    ctx.caretMoved.notify(override);
  }

  function mentionKey(ctx, code) {
    let mentions = ctx.data.extend;
    mentions = mentions && mentions.mentions;
    if (! mentions) return;
    const id = String.fromCharCode(code);
    if (mentions[id])
      return id;
  }

  function getTag(tag) {
    const range = Dom.getRange();
    if (range === null) return null;
    const start = range.endContainer;
    return Dom.searchUpFor(start, elm => elm.tagName === tag, 'richTextEditor');
  }

  function execCommand (cmd, value) {
    return document.execCommand(cmd, false, value);
  }

  function move(editor, type, amount) {
    const range = select(editor, type, amount);
    range.collapse(amount < 0);
    Dom.setRange();
    return range;
  }

  function select(editor, type, amount) {
    const range = Dom.getRange();
    const obj = {node: range.startContainer, offset: range.startOffset};

    if (! Dom.contains(editor, obj.node)) return;

    if (amount >= 0) {
      while (amount-- && forwardOneChar(editor, obj))
        ;
      range.setEnd(obj.node, obj.offset);
    } else {
      while (amount++ && backOneChar(editor, obj))
        ;
      range.setStart(obj.node, obj.offset);
    }

    return range;
  }

  function backOneChar(editor, obj) {
    let other, {node, offset} = obj;

    if (node.nodeType === TEXT_NODE) {
      --offset;
      if (offset >= 0) {
        obj.offset = offset;
        return true;
      }
    } else {
      node = node.childNodes[offset];
    }
    if (! node)
      return;

    offset = -1;

    while ( node !== editor) {
      other = node.previousSibling;
      if (other) {
        node = lastInnerMostNode(other);
        obj.node = node;
        if (node.nodeType === TEXT_NODE) {
          offset = offset + node.textContent.length;
        } else {
          offset = 0;
        }
        obj.offset = offset;
        return true;
      } else {
        node = node.parentNode;
        if (! INLINE_TAGS[node.tagName])
          offset = 0;
      }
    }

    return;
  }

  function lastInnerMostNode(node) {
    let other;
    if (node.nodeType === TEXT_NODE) {
      if (node.textContent.length) {
        return node;
      }
      other = node.previousSibling;
      return other && lastInnerMostNode(other);
    }
    if (other = node.lastChild) {
      return lastInnerMostNode(other) || other;
    }
  }

  function firstInnerMostNode(node) {
    let other;
    if (node.nodeType === TEXT_NODE) {
      if (node.textContent.length) {
        return node;
      }
      other = node.nextSibling;
      return other && firstInnerMostNode(other);
    }
    if (other = node.firstChild) {
      return firstInnerMostNode(other) || other;
    }
  }

  function forwardOneChar(editor, obj) {
    let other, {node, offset} = obj;

    if (node.nodeType === TEXT_NODE) {
      ++offset;
      if (offset <= node.textContent.length) {
        obj.offset = offset;
        return true;
      }
    } else {
      node = node.childNodes[offset];
    }
    if (! node)
      return;

    offset = 1;

    while ( node !== editor) {
      other = node.nextSibling;
      if (other) {
        node = firstInnerMostNode(other);
        obj.node = node;
        obj.offset = offset;
        return true;
      } else {
        node = node.parentNode;
        if (! INLINE_TAGS[node.tagName])
          offset = 0;
      }
    }

    return;
  }

  function isPrevChar(char) {
    const range = Dom.getRange();
    if (range.startContainer.nodeType !== TEXT_NODE)
      return;
    const offset = range.startOffset;
    if (offset && range.startContainer.textContent[offset - 1] === char)
      return range;
  }

  function normRange(editor, range) {
    normPos(editor, range, range.startContainer, range.startOffset, 'setStart');
    normPos(editor, range, range.endContainer, range.endOffset, 'setEnd');
    return range;
  }

  function normPos(editor, range, node, offset, setter) {
    if (node.nodeType !== TEXT_NODE) {
      if (node.tagName === 'BR') {
        if (offset !== 0) range[setter](node, 0);
        return;
      }
      const children = node.childNodes;
      if (! children.length) return;
      let curr = node.childNodes[offset];
      if (curr && curr.tagName === 'BR') {
        range[setter](curr, 0);
        return;
      }
      curr = (curr && firstInnerMostNode(curr)) || lastInnerMostNode(node.childNodes[offset - 1]);
      if (curr.nodeType !== TEXT_NODE && curr.tagName !== 'BR') {
        const obj = {node: node, offset: offset};
        forwardOneChar(editor, obj);
        range[setter](obj.node, obj.offset);
      } else if (curr !== node) {
        range[setter](curr, 0);
      }
    }
  }

  function isBlockNode(node) {
    return node.nodeType === 1 && ! INLINE_TAGS[node.tagName];
  }

  function traceContainingBlock(editor, node, wrt) {
    const trace = [];
    while (node !== editor) {
      trace.push(node);
      node = node.parentNode;
    }
    if (! wrt) return trace;
    let wrtIdx = wrt.length - 1;
    let traceIdx = trace.length - 1;
    while(wrt[wrtIdx] === trace[traceIdx]) {
      --wrtIdx; -- traceIdx;
    }
    wrt.length = wrtIdx + 1;
    trace.length = traceIdx + 1;
    return trace;
  }

  function findContainingBlock(editor, node) {
    if (isBlockNode(node)) return node;
    node = findBeforeBlock(editor, node);
    if (node.nodeType === TEXT_NODE || INLINE_TAGS[node.tagName])
      return node.parentNode;

    return node;
  }

  function findBeforeBlock(editor, node) {
    let last = node;
    node = node.parentNode;
    while (node && node !== editor && INLINE_TAGS[node.tagName]) {
      last = node;
      node = node.parentNode;
    }

    return last;
  }

  function fixSpaces(data) {
    data = data.replace(/[ \u00a0]{2}/g, ' \u00a0');
    if (data.slice(-1) === ' ') data = data.slice(0, -1) + '\xa0';
    return data;
  }

  function deleteEmpty(range) {
    const node = range.startContainer;
    if (node.nodeType !== TEXT_NODE) return;
    let offset = range.startOffset;
    let other, parent = other.parentNode;
    while ((other = node.previousSibling) && other.nodeType === TEXT_NODE) {
      node.textContent = other.textContent + node.textContent;
      offset += other.textContent.length;
      other.remove();
    }
    while ((other = node.nextSibling) && other.nodeType === TEXT_NODE) {
      node.textContent = node.textContent + other.textContent;
      other.remove();
    }
    node.textContent = fixSpaces(node.textContent);
    node.textContent.length || killNode();
    range.setStart(node, offset);
    range.collapse(true);

    function killNode() {
      const other = node.nextSibling;
      offset = 0;
      if (! other) {
        other = node.previousSibling;
        other = other && lastInnerMostNode(other);
        if (other && other.nodeType === TEXT_NODE)
          offset =  other.textContent.length;
      }
      node.remove();
      if (! other) {
        if (isBlockNode(parent))
          parent.appendChild(node = BR.cloneNode());
        else {
          node = parent;
          parent = node.parentNode;
          killNode();
        }
      }
    }
  }

  Dom.registerHelpers({
    richTextEditor(content, options) {
      return Tpl.$autoRender({content: content, options: options});
    }
  });

  RichTextMention.init(Tpl);

  Link.$extend({
    $created(ctx) {
      ctx.data.inputCtx.openDialog = true;
    },

    $destroyed(ctx) {
      Dom.setRange(ctx.data.range);
      ctx.data.inputElm.focus();
      ctx.data.inputCtx.openDialog = false;
    },

    cancel(elm) {
      Dom.remove(elm);
    },
  });

  Link.$events({
    'submit'(event) {
      Dom.stopEvent();
      const inputs = this.getElementsByTagName('input');

      const {data} = $.ctx;
      Dom.setRange(data.range);
      data.inputElm.focus();
      const href = inputs[1].value;
      Tpl.insert(Dom.h({a: inputs[0].value || href, $href: href}));
      Dom.remove(event.currentTarget);
    },
  });

  function codeNode(editor, range) {
    for(let node = range.startContainer; node && node !== editor; node = node.parentNode) {
      if (node.nodeType === 1 && RichText.fontType(node.style.fontFamily) === 'monospace') {
        return (range.collapsed || Dom.contains(node, range.endContainer)) && node;
      }
    }
  }

  Tpl.FontColor.$events({
    'click button'(event) {
      Dom.stopEvent();
      this.focus();
      const type = this.getAttribute('name');
      if (type === 'removeHilite') {
        $.ctx.parentCtx.data.callback(type);
        Dom.remove($.ctx.parentCtx.element());
        return;
      }
      event.currentTarget.setAttribute('data-mode', type);
      ColorPicker.setColor($.ctx.parentCtx, $.ctx.data[type]);
    },
  });
});

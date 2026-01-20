define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const RichText        = require('koru/dom/rich-text');
  const Observable      = require('koru/observable');
  const DomNav          = require('koru/ui/dom-nav');
  const DomUndo         = require('koru/ui/dom-undo');
  const util            = require('koru/util');
  const uColor          = require('koru/util-color');
  const ColorPicker     = require('./color-picker');
  const KeyMap          = require('./key-map');
  const Modal           = require('./modal');
  const RichTextMention = require('./rich-text-mention');
  const SelectMenu      = require('./select-menu');
  const session         = require('../session/client-rpc');

  const Tpl = Dom.newTemplate(module, require('koru/html!./rich-text-editor'));
  const $ = Dom.current;
  const {Link} = Tpl;

  let languageList;

  const {TEXT_NODE} = document;
  const {FONT_SIZE_TO_EM} = RichText;
  const {shift, ctrl, meta, alt} = KeyMap;
  const {insertNode, getTag, selectNode, newline, normRange, selectRange} = DomNav;

  const noop = util.voidFunc;

  const EMPTY_PRE = Dom.h({pre: document.createElement('BR'), 'data-lang': 'text'});
  const execCommand = (cmd, value) => document.execCommand(cmd, false, value);

  const commandify = (func, cmd) => {
    switch (typeof func) {
      case 'function':
        return func;
      case 'boolean':
        return func
          ? (event) => {
            execCommand(cmd);
            const ctx = Tpl.$ctx(event.target);
            notify(ctx, 'force', {});
          }
          : noop;
    }
    for (const id in func) {
      func[id] = commandify(func[id], id);
    }
    return func;
  };

  const FONT_LIST = RichText.standardFonts.map((
    name,
    id,
  ) => [id, Dom.h({font: util.capitalize(util.humanize(name)), $face: RichText.fontIdToFace[id]})]);

  const FONT_SIZE_LIST = [
    [1, 'X small'],
    [2, 'Small'],
    [3, 'Medium'],
    [4, 'Large'],
    [5, 'X large'],
    [6, 'XX large'],
    [7, 'XXX large'],
  ];

  FONT_SIZE_LIST.forEach((row) => {
    row[1] = Dom.h({font: row[1], $size: row[0]});
  });

  execCommand('styleWithCSS', true);

  const getModeNode = (ctx, elm) => {
    for (const editor = ctx.inputElm; elm && elm !== editor; elm = elm.parentNode) {
      switch (elm.tagName) {
        case 'PRE':
          return elm;
      }
    }
  };

  const setMode = (ctx, range = Dom.getRange()) => {
    if (range === null) return;
    let elm = range.startContainer;
    if (elm === ctx.lastElm) {
      if (!ctx.override || (range.collapsed && ctx.lastOffset === range.startOffset)) {
        return;
      }
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
  };

  const ensureLangues = (ctx) => {
    if (languageList) return;
    session.rpc('RichTextEditor.fetchLanguages', (err, result) => {
      Tpl.languageList = result;
      notify(ctx, 'force');
    });
  };

  const nodeRange = (elm, offset = 0) => {
    const range = document.createRange();
    range.setStart(elm, offset);
    return range;
  };

  const notify = (ctx, force, override) => {
    const range = Dom.getRange() || nodeRange(ctx.inputElm);
    const elm = range.startContainer.nodeType !== TEXT_NODE
      ? range.startContainer.childNodes[range.startContainer.offset] || range.startContainer
      : range.startContainer;

    if (
      !force && ctx.lastElm === elm &&
      (!ctx.override || (range.collapsed && ctx.lastOffset === range.startOffset))
    ) {
      return;
    }

    ctx.override = override;
    ctx.lastElm = elm;
    ctx.lastOffset = range.startOffset;

    ctx.caretMoved.notify(override);
  };

  const mentionKey = (ctx, code) => {
    let mentions = ctx.data.extend;
    mentions = mentions && mentions.mentions;
    if (!mentions) return;
    const id = String.fromCharCode(code);
    if (mentions[id]) {
      return id;
    }
  };

  const fontNode = (top, node) => {
    for (; node !== null && node !== top; node = node.parentNode) {
      if (
        node.nodeType === 1 && RichText.fontType(node.style.getPropertyValue('font-family')) !== ''
      ) {
        return node;
      }
    }
    return top;
  };

  const undoredo = (event, cmd) => {
    const ctx = Tpl.$ctx(event.target);
    if (ctx.undo[cmd]()) {
      ctx.lastElm = undefined;
      setMode(ctx);
    }
  };

  const actions = commandify({
    bold: true,
    italic: true,
    underline: true,
    strikeThrough: true,
    insertOrderedList: true,
    insertUnorderedList: true,
    outdent: true,
    indent: true,
    justifyLeft: true,
    justifyCenter: true,
    justifyRight: true,
    justifyFull: true,
    removeFormat: true,
    fontName: (event) => {
      chooseFromMenu(event, {list: FONT_LIST}, (ctx, id) => {
        execCommand('fontName', RichText.fontIdToFace[id]);
        if (Dom.getRange().collapsed) {
          return {font: id};
        }
      });
    },
    fontColor: (event) => {
      const ctx = Tpl.$ctx(event.target);
      const focus = ctx.inputElm;

      let range = Dom.getRange();
      let node = range === null ? DomNav.firstInnerMostNode(focus) : range.endContainer;
      if (node && node.nodeType === TEXT_NODE) {
        node = node.parentNode;
      }

      if (node === null) {
        return;
      }

      const style = window.getComputedStyle(node);

      let fgColor = uColor.toRGB(style.color);
      let bgColor = style.backgroundColor;
      bgColor = uColor.toRGB(bgColor === 'transparent' ? 'rgba(0,0,0,0)' : bgColor);

      const options = {
        foreColor: fgColor.a < .1 ? '#ffffff' : uColor.rgb2hex(fgColor),
        hiliteColor: bgColor.a < .1 ? '#ffffff' : uColor.rgb2hex(bgColor),
      };
      const typeElm = Tpl.FontColor.$autoRender(options);

      ctx.openDialog = true;
      ColorPicker.choose({
        color: fgColor,
        anchor: range || node,
        customFieldset: typeElm,
        callback: (color) => {
          ctx.openDialog = false;
          focus.focus();
          range && Dom.setRange(range);
          if (color === 'removeHilite') {
            execCommand('hiliteColor', 'initial');
            return;
          }
          const cmd = typeElm.getAttribute('data-mode');
          color && execCommand(cmd, color);
        },
      });
    },
    fontSize: (event) => {
      chooseFromMenu(event, {list: FONT_SIZE_LIST, classes: 'fontSize'}, (ctx, id) => {
        execCommand('fontSize', +id);
        if (Dom.getRange().collapsed) {
          return {fontSize: id};
        }
      });
    },
    code: (event) => {
      const range = Dom.getRange();
      const editor = Dom.getClosest(range.startContainer, '.input');
      if (editor === null) return;

      const ctx = Dom.myCtx(editor.parentNode);

      let {startContainer: sc, endContainer: ec, collapsed} = range;

      if (sc.nodeType === TEXT_NODE && DomNav.rangeIsInline(range)) {
        if (!collapsed) {
          if (range.startOffset == sc.nodeValue.length) {
            sc = DomNav.nextNode(sc);
          }
          if (ec.nodeType === TEXT_NODE && range.endOffset == 0) {
            ec = DomNav.previousNode(ec);
          }
        }
        const fn = fontNode(editor, sc),
          fnFont = (ctx.override && ctx.override.font) || fn.style.getPropertyValue('font-family');
        const efnFont = collapsed || ctx.override
          ? fnFont
          : fontNode(editor, ec).style.getPropertyValue('font-family');
        let font = 'monospace';
        if (fnFont === efnFont && fnFont === 'monospace') {
          let pn = fn;
          while (pn !== editor) {
            pn = fontNode(editor, fn.previousSibling || fn.parentNode);
            font = pn.style.getPropertyValue('font-family');
            if (font !== 'monospace') break;
          }
          if (font === 'monospace' || font === '') font = RichText.fontIdToFace[0];
        }
        execCommand('fontName', font);
        notify(ctx, 'force', collapsed && {font});
      } else {
        if (collapsed) {
          const pre = EMPTY_PRE.cloneNode(true);
          const cn = DomNav.containingNode(range);
          if (cn.tagName === 'BR') {
            range.selectNode(cn);
            Dom.setRange(range);
          }
          insertNode(pre, pre, 0);
        } else {
          const pre = RichText.fromToHtml(Dom.h({pre: range.extractContents()})).firstChild;
          insertNode(pre);
          range.selectNodeContents(pre);
          Dom.setRange(range);
        }
        ctx.mode = codeMode;
        ensureLangues(ctx);
        notify(ctx, 'force');
      }
    },
    link: () => {
      const inputCtx = Tpl.$ctx();

      const aElm = getTag('A', inputCtx.inputElm);
      const range = selectNode(aElm) || Dom.getRange();
      if (!range) return;

      const dialog = Link.$autoRender({
        range,
        elm: aElm,
        link: aElm == null ? '' : aElm.getAttribute('href'),
        text: range.toString() || '',
        inputCtx,
        inputElm: inputCtx.inputElm,
      });
      const caretPos = Dom.getBoundingClientRect(range);
      Modal.appendBelow({container: dialog, handleTab: true, boundingClientRect: caretPos});
      const rtLink = dialog.firstChild;
      const rtPos = rtLink.getBoundingClientRect();
      const caretPointerStyle = rtLink.lastChild.style;
      rtLink.classList.toggle('below', !!rtLink.style.getPropertyValue('top'));
      caretPointerStyle.setProperty('left', (caretPos.left - rtPos.left) + 'px');

      dialog.querySelector('[name=link]').focus();
    },
    mention: (event) => {
      const range = Dom.getRange();
      if (range === null) return;

      const button = event.target;
      const dialog = RichTextMention.$autoRender({
        range,
        type: button.getAttribute('data-type'),
        mentions: $.ctx.parentCtx.data.extend.mentions,
        inputCtx: $.ctx.parentCtx,
        value: range.toString(),
        inputElm: Tpl.$ctx(range.startContainer).inputElm,
      });

      Modal.append('on', {
        container: dialog,
        handleTab: true,
        boundingClientRect: Dom.getBoundingClientRect(range),
      });
      dialog.getElementsByTagName('input')[0].focus();
    },
  });

  for (let i = 0; i < 7; ++i) {
    const cmd = i == 0 ? 'div' : 'H' + i;
    actions['heading' + i] = () => {
      execCommand('formatBlock', cmd);
    };
  }

  const mapActions = (keys, actions) => {
    for (const name in keys) {
      const seqs = keys[name];
      keys[name] = Array.isArray(seqs) ? [...seqs, actions[name]] : [seqs, actions[name]];
    }
    return keys;
  };

  const commonActions = {
    undo: (event) => {
      undoredo(event.target, 'undo');
    },
    redo: (event) => {
      undoredo(event.target, 'redo');
    },
  };

  const CTRL_TO_META = {mapCtrlToMeta: true};

  const commonKeys = mapActions(
    {undo: ctrl + 'Z', redo: [ctrl + shift + 'Z', ctrl + 'Y']},
    commonActions,
  );

  const keyMap = KeyMap(commonKeys, CTRL_TO_META);
  keyMap.addKeys(
    mapActions({
      bold: ctrl + 'B',
      italic: ctrl + 'I',
      underline: ctrl + 'U',
      strikeThrough: alt + shift + '5',
      insertOrderedList: ctrl + shift + '7',
      insertUnorderedList: ctrl + shift + '8',
      outdent: ctrl + 'Û',
      indent: ctrl + 'Ý',
      link: ctrl + 'K',
      code: ctrl + 'À',
      justifyLeft: ctrl + shift + 'L',
      justifyCenter: ctrl + shift + 'E',
      justifyRight: ctrl + shift + 'R',
      justifyFull: ctrl + shift + 'J',
      removeFormat: ctrl + 'Ü',
      fontColor: ctrl + shift + 'H',
      fontName: ctrl + shift + 'O',
    }, actions),
    CTRL_TO_META,
  );

  for (let i = 0; i < 7; ++i) {
    const name = 'heading' + i;
    keyMap.addKeys({[name]: [alt + ctrl + i, actions[name]]}, {mapCtrlToMeta: true});
  }

  const chooseFromMenu = (event, options, onSelect) => {
    const ctx = Tpl.$ctx(event.target);
    const origin = event.target;

    options = Object.assign({
      onSelect: (item) => {
        const id = $.data(item)._id;

        // close dialog before notify to restore range
        Dom.remove(Dom.getClosest(item, '.glassPane'));
        notify(ctx, 'force', onSelect(ctx, id));
      },
      onClose: () => {
        ctx.openDialog = null;
      },
    }, options);

    options.boundingClientRect = ctx.inputElm.contains(event.target)
      ? Dom.getBoundingClientRect(Dom.getRange())
      : event.target.getBoundingClientRect();

    ctx.openDialog = true;
    SelectMenu.popup(event.target, options);
  };

  const insertFragContents = (frag, pn, before, notTag) => {
    if (frag.length != 0) {
      const from = frag.firstChild;
      if (from === null) return;
      if (from.tagName === notTag) {
        while (from.firstChild) pn.insertBefore(from.firstChild, before);
      } else {
        pn.insertBefore(frag, before);
      }
    }
  };

  const syntaxHighlight = (inputElm) => {
    const ctx = Tpl.$ctx(inputElm);
    const pre = Dom.getClosest(ctx.lastElm, 'pre');
    Dom.addClass(ctx.inputElm.parentNode, 'syntaxHighlighting');
    const rt = RichText.fromHtml(pre, {includeTop: true});
    session.rpc(
      'RichTextEditor.syntaxHighlight',
      pre.getAttribute('data-lang'),
      rt[0].replace(/^.*\n/, ''),
      (err, result) => {
        Dom.removeClass(ctx.inputElm.parentNode, 'syntaxHighlighting');
        if (err) return koru.globalCallback(err);
        result[2] = rt[1][2];
        if (util.deepEqual(result, rt[1])) {
          return;
        }
        const range = Dom.getRange();
        while (pre.firstChild !== null) pre.removeChild(pre.firstChild);
        let i = RichText.toHtml(rt[0], result).firstChild.firstChild;
        while (i !== null) {
          const t = i;
          i = i.nextSibling;
          pre.appendChild(t);
        }
        setMode(ctx);
      },
    );
  };

  const codeActions = commandify({
    language: (event) => {
      chooseFromMenu(event, {search: SelectMenu.nameSearch, list: languageList}, (ctx, id) => {
        const pre = Dom.getClosest(ctx.lastElm, 'pre');
        pre && pre.setAttribute('data-lang', id);
        codeMode.language = id;
        syntaxHighlight(event.target);
      });
    },
    syntaxHighlight: (event) => {
      syntaxHighlight(event.target);
    },

    bold: false,
    italic: false,
    underline: false,
    newline: () => {
      newline();
    },
    code: (event) => {
      const ctx = Tpl.$ctx(event.target);
      const pre = Dom.getClosest(ctx.lastElm, 'pre');
      const pn = pre.parentNode;
      const range = Dom.getRange();

      const isLine = range.collapsed;

      let sc = isLine ? DomNav.rangeStartNode(range) || range.startContainer : null,
        so = isLine && sc.nodeType === TEXT_NODE ? range.startOffset : 0,
        ec = null;

      const line = DomNav.restrictRange(isLine ? DomNav.selectLine(range) : range, pre);

      if (isLine && line.startContainer.nodeType === TEXT_NODE) {
        line.setStart(line.startContainer.parentNode, Dom.nodeIndex(line.startContainer));
      }

      const pre2Range = line.cloneRange();
      pre2Range.setEnd(pre, pre.childNodes.length);

      const frag = line.extractContents();
      if (!isLine) {
        sc = frag.firstChild;
        ec = frag.lastChild;
      }

      DomNav.clearEmptyInline(frag);

      DomNav.clearEmptyInline(pre);

      if (pre.firstChild === null) {
        insertFragContents(frag, pn, pre, 'PRE');
        pre.remove();
      } else {
        const pre2 = pre.cloneNode(), before = pre.nextSibling;

        insertFragContents(frag, pn, before, 'PRE');

        const pre2Frag = pre2Range.extractContents();
        DomNav.clearEmptyInline(pre2Frag);
        if (pre2Frag.firstChild !== null) {
          insertFragContents(pre2Frag, pre2, null, 'PRE');
          pn.insertBefore(pre2, before);
        }

        DomNav.clearEmptyInline(pre);

        if (pre.firstChild === null) {
          pre.remove();
        }
      }

      if (isLine) {
        if (pn.contains(sc)) {
          range.setStart(sc, so);
          range.collapse(true);
          normRange(range);
          Dom.setRange(range);
        }
      } else {
        range.setStart(sc, 0);
        range.setEnd(ec, ec.nodeType === TEXT_NODE ? ec.nodeValue.length : ec.childNodes.length);
        normRange(range);
        Dom.setRange(range);
      }

      ctx.mode = standardMode;
      notify(ctx, 'force');
    },
  });

  const codeKeyMap = KeyMap(commonKeys, CTRL_TO_META);
  codeKeyMap.addKeys(
    mapActions({
      language: ctrl + 'L',
      bold: ctrl + 'B',
      italic: ctrl + 'I',
      underline: ctrl + 'U',
      syntaxHighlight: ctrl + shift + 'H',
      newline: '\r',
      code: ctrl + 'À',
    }, codeActions),
    CTRL_TO_META,
  );

  const optionKeys = {type: true, focusout: true};

  Tpl.$helpers({
    attrs() {
      const elm = $.element;
      const {options} = this;
      const {ctx} = $;
      ctx.undo.disconnect(false);
      for (let id in options) {
        if (optionKeys[id] || id[0] === '$') continue;
        (id === 'placeholder' ? ctx.inputElm : elm).setAttribute(id, options[id]);
      }
      Dom.addClass(elm, 'richTextEditor');
      ctx.undo.reconnect();
    },
  });

  const standardMode = {
    actions,
    type: 'standard',

    keyMap,

    paste: (htmlText) => {
      const html = RichText.fromToHtml(Dom.textToHtml(`<div>${htmlText}</div>`));
      Tpl.insert(html, 'inner') || Tpl.insert(RichText.fromHtml(html)[0]);
    },

    pasteText: (text) => {
      const URL_RE = /(\bhttps?:\/\/\S+)/;

      if (Tpl.handleHyperLink && URL_RE.test(text)) {
        const html = document.createElement('DIV');
        text.split(/(\r?\n)/).forEach((line, oi) => {
          if (oi % 2) {
            html.appendChild(document.createElement('BR'));
          } else {
            line.split(URL_RE).forEach((part, index) => {
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
      if (event.ctrlKey || event.metaKey || event.altKey) {
        keyMap.exec(event, 'ignoreFocus');
        return;
      }

      if ($.ctx.mentionState != null && $.ctx.mentionState < 3 && ++$.ctx.mentionState > 2) {
        // we had a non printable key pressed; abort mention
        RichTextMention.revertMention(this);
      }
    },
  };

  const codeMode = {
    actions: codeActions,
    type: 'code',

    keyMap: codeKeyMap,

    keydown: (event) => {
      if (event.which === 40 && !(event.ctrlKey || event.metaKey || event.altKey)) {
        return;
      }
      codeKeyMap.exec(event, 'ignoreFocus');
    },

    paste: (htmlText) => {
      const range = Dom.getRange();
      range.deleteContents();
      let i = RichText.fromToHtml(Dom.textToHtml(`<pre>${htmlText}</pre>`)).firstChild.firstChild;
      while (i !== null) {
        const t = i;
        i = i.nextSibling;
        range.insertNode(t);
        range.setEndAfter(t);
        range.collapse();
      }
      normRange(range);
      range.collapse();
      Dom.setRange(range);
    },
  };

  const modes = {standard: standardMode, code: codeMode};

  function getHtml() {
    return Dom.myCtx(this).inputElm.cloneNode(true);
  }

  function setHtml(value) {
    const {inputElm} = Dom.myCtx(this);
    Tpl.clear(inputElm);
    value && inputElm.appendChild(value);
  }

  const focusInput = (event) => {
    const elm = event.currentTarget;
    const parent = elm.parentNode;
    const pCtx = Dom.myCtx(parent);
    if (pCtx == null) return;

    const focusout = event.type === 'focusout' && !parent.contains(document.activeElement);

    if (focusout) {
      if (currentDialog(elm)) {
        return;
      }
      document.removeEventListener('selectionchange', pCtx.selectionchange);
      const data = pCtx.data;
      data.options.focusout && data.options.focusout.call(elm, event);
    } else {
      pCtx && pCtx.lastElm === undefined && setMode(pCtx);
      execCommand('styleWithCSS', true);
      document.addEventListener('selectionchange', pCtx.selectionchange);
    }
    Dom.setClass('focus', !focusout, parent);
  };

  const currentDialog = (me) => {
    const ctx = Dom.myCtx(me.parentNode);
    return ctx && ctx.openDialog;
  };

  Tpl.$extend({
    $created: (ctx, elm) => {
      Object.defineProperty(elm, 'value', {configurable: true, get: getHtml, set: setHtml});
      ctx.inputElm = elm.lastChild;
      ctx.caretMoved = new Observable();
      ctx.inputElm.addEventListener('focusin', focusInput);
      ctx.inputElm.addEventListener('focusout', focusInput);
      ctx.mode = standardMode;
      ctx.data.content && ctx.inputElm.appendChild(ctx.data.content);

      const undo = ctx.undo = new DomUndo(ctx.inputElm);
      ctx.selectionchange = () => {
        const range = Dom.getRange();
        if (range != null && ctx.inputElm.contains(range.startContainer)) {
          setMode(ctx, range);
          undo.saveCaret(range);
        }
      };
    },

    $destroyed: (ctx) => {
      document.removeEventListener('selectionchange', ctx.selectionchange);
      ctx.inputElm.addEventListener('focusin', focusInput);
      ctx.inputElm.addEventListener('focusout', focusInput);
      Dom.remove(ctx.selectItem);
    },

    title: (title, action, mode) => modes[mode].keyMap.getTitle(title, action),

    clear: (elm) => {
      if (!Dom.hasClass(elm, 'richTextEditor')) {
        elm = elm.parentNode;
      }
      const ctx = Dom.ctx(elm);
      ctx.undo.disconnect();
      const input = ctx.inputElm;
      input.textContent = '';
      Dom.remove(ctx.selectItem);
      ctx.undo.reconnect();
      notify(ctx, 'force', {});
    },

    moveLeft: (editor, mark) => {
      const range = selectRange(editor, 'char', -1);
      if (!range) return;
      if (!mark) {
        range.collapse(true);
      }
      Dom.setRange(range);
    },

    execCommand,
    chooseFromMenu,

    runAction: (ctx, id, event) => {
      const cc = commonActions[id] || ctx.mode.actions[id];
      return cc(event);
    },

    insert: (arg, inner) => {
      const range = Dom.getRange();

      if (typeof arg === 'string') {
        return execCommand('insertText', arg);
      }

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
      return execCommand('insertHTML', t);
    },

    get languageList() {
      return languageList;
    },

    set languageList(value) {
      languageList = value;
      Tpl.languageMap = {};
      value && value.forEach((lang) => {
        Tpl.languageMap[lang[0]] = lang[1];
      });
    },

    modes,
  });

  Tpl.$events({
    input: (event) => {
      const input = event.target;
      const fc = input.firstChild;
      if (fc && fc === input.lastChild && input.firstChild.tagName === 'BR') {
        fc.remove();
      }

      util.forEach(input.querySelectorAll('BLOCKQUOTE[style],SPAN'), (node) => {
        switch (node.tagName) {
          case 'BLOCKQUOTE':
            node.removeAttribute('style');
            break;
          case 'SPAN':
            const st = node.style;
            const fs = st.fontSize;
            if (fs && fs.slice(-2) !== 'em') {
              st.fontSize = FONT_SIZE_TO_EM[fs.replace(/^-[a-z]+-/, '')] || '3em';
              st.lineHeight = '1em';
            }
            break;
        }
      });
    },

    paste: (event) => {
      let foundText, type;
      const cb = event.clipboardData;
      if (!cb) return;

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

    'click a,button': (event) => {
      event.preventDefault();
    },

    keydown(event) {
      const mdEditor = this.parentNode;

      switch (event.which) {
        case 229:
        case 16:
          return;
      }

      if (event.shiftKey) {
        if (event.which === 13) {
          Dom.stopEvent(event);
          newline($.ctx.inputElm);
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
          span,
        });
        return;
      }
      const mentionType = mentionKey(ctx, event.which);
      if (mentionType && event.shiftKey) {
        ctx.mentionType = mentionType;
        const range = Dom.getRange();
        if (range.startOffset !== 0) {
          let text;
          if (range.startContainer.nodeType === TEXT_NODE) {
            text = range.startContainer.nodeValue;
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
      if (ctx.selectItem && $.data(ctx.selectItem).span.parentNode === null) {
        Dom.remove(ctx.selectItem);
      }
    },
  });

  Dom.registerHelpers({richTextEditor: (content, options) => Tpl.$autoRender({content, options})});

  RichTextMention.init(Tpl);

  Link.$extend({
    $created: (ctx) => {
      ctx.data.inputCtx.openDialog = true;
    },

    $destroyed: (ctx) => {
      Dom.setRange(ctx.data.range);
      ctx.data.inputElm.focus();
      ctx.data.inputCtx.openDialog = false;
    },

    cancel: (elm) => {
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

  return Tpl;
});

define(function(require, exports, module) {
  var util = require('koru/util');
  var Dom = require('koru/dom');
  var RichText = require('./rich-text');
  var KeyMap = require('./key-map');
  var RichTextMention = require('./rich-text-mention');
  var Modal = require('./modal');
  var makeSubject = require('koru/make-subject');
  var SelectMenu = require('./select-menu');
  var session = require('../session/client-rpc');
  var koru = require('koru');
  var uColor = require('koru/util-color');
  var ColorPicker = require('./color-picker');

  var Tpl = Dom.newTemplate(module, require('koru/html!./rich-text-editor'));
  var $ = Dom.current;
  var Link = Tpl.Link;

  var languageList;

  var TEXT_NODE = document.TEXT_NODE;

  var BR = document.createElement('br');

  var INLINE_TAGS = RichText.INLINE_TAGS;

  var shift = KeyMap.shift, ctrl = KeyMap.ctrl;

  var EMPTY_PRE = Dom.h({pre: {div: BR.cloneNode()}, '$data-lang': 'text'});

  var FONT_LIST = RichText.standardFonts.map(function (id) {
    return [id, Dom.h({font: util.capitalize(util.humanize(id)), $face: id})];
  });

  var actions = commandify({
    bold: true,
    italic: true,
    underline: true,
    insertOrderedList: true,
    insertUnorderedList: true,
    outdent: true,
    indent: true,
    fontName: function (event) {
      chooseFromMenu(event, {list: FONT_LIST}, function (ctx, id) {
        execCommand('fontName', id);
        if (Dom.getRange().collapsed)
          return {font: id};
      });
    },
    textColor: function (event) {
      var node = Dom.getRange().endContainer;
      if (node && node.nodeType === TEXT_NODE)
        node = node.parentNode;
      if (! node) return;
      var style = window.getComputedStyle(node);

      var fgColor = uColor.toRGB(style.color);
      var bgColor = uColor.toRGB(style.backgroundColor);

      fgColor = fgColor.a < .1 ? "#ffffff" : uColor.rgb2hex(fgColor);
      bgColor = bgColor.a < .1 ? "#ffffff" : uColor.rgb2hex(bgColor);

      var focus = document.activeElement;
      var range = Dom.getRange();

      var options = {foreColor: fgColor, hiliteColor: bgColor};
      var typeElm = Tpl.TextColor.$autoRender(options);
      ColorPicker.choose(fgColor, {customFieldset: typeElm}, function (color) {
        focus.focus();
        Dom.setRange(range);
        if (color === 'removeHilite') {
          execCommand('hiliteColor', 'initial');
          return;
        }
        var cmd = typeElm.getAttribute('data-mode');
        color && execCommand(cmd, color);
      });
    },
    fontSize: function (event) {
      execCommand('fontSize', 5);
    },
    code: function (event) {
      var range = Dom.getRange();
      var sc = range.startContainer;
      var ec = range.endContainer;
      var collapsed = range.collapsed;

      var editor = Dom.getClosestClass(sc, 'input');
      if (! editor) return;

      var _code;

      var ctx = Dom.getMyCtx(editor.parentNode);

      if (sc.nodeType === TEXT_NODE && ((_code = codeNode(editor, range)) || ec === sc)) {
        var font = _code ? 'initial': 'monospace';
        execCommand('fontName', font);
        notify(ctx, 'force', collapsed && {font: font});
      } else {
        if (collapsed) {
          var html = EMPTY_PRE.cloneNode(true);
        } else {
          var html = RichText.fromToHtml(Dom.h({pre: range.extractContents()})).firstChild;
        }
        Tpl.insert(html);
        ctx.mode = codeMode;
        ensureLangues(ctx);
        notify(ctx, 'force');
      }
    },
    link: function () {
      var aElm = getTag('A');
      var range = Dom.selectElm(aElm) || Dom.getRange();
      if (! range) return;

      var dialog = Link.$autoRender({
        range: range,
        elm: aElm,
        link: aElm ? aElm.getAttribute('href') : '',
        text: range.toString() || '',
        inputElm: Tpl.$ctx(aElm).inputElm,
      });
      Modal.appendBelow({
        container: dialog,
        handleTab: true,
        boundingClientRect: Dom.getRangeClientRect(range),
      });
      dialog.querySelector('[name=link]').focus();
    },
    mention: function (event) {
      var range = Dom.getRange();
      if (! range) return;

      var button = event.target;
      var dialog = RichTextMention.$autoRender({
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

  var keyMap = KeyMap(mapActions({
    bold: ctrl+'B',
    italic: ctrl+'I',
    underline: ctrl+'U',
    insertOrderedList: ctrl+shift+'7',
    insertUnorderedList: ctrl+shift+'8',
    outdent: ctrl+'Û', // '['
    indent: ctrl+'Ý', // ']'
    link: ctrl+'K',
    code: ctrl+'À',
  }, actions));

  keyMap.addKeys(mapActions({
    outdent: ctrl+'[',
    indent: ctrl+']',
    code: ctrl+'`',
  }, actions));

  function chooseFromMenu(event, options, onSelect) {
    var ctx = Tpl.$ctx(event.target);
    var origin = event.target;

    options = util.extend({
      onSelect: function (item) {
        var id = $.data(item).id;

        // close dialog before notify to restore range
        Dom.remove(Dom.getClosestClass(item, 'glassPane'));
        notify(ctx, 'force', onSelect(ctx, id));
      },
    }, options);

    options.boundingClientRect = ctx.inputElm.contains(event.target) ?
      Dom.getRangeClientRect(Dom.getRange()) :
      event.target.getBoundingClientRect();

    SelectMenu.popup(event.target, options);
  }

  var codeActions = commandify({
    language: function (event) {
      chooseFromMenu(event, {
        search: SelectMenu.nameSearch,
        list: languageList,
      }, function (ctx, id) {
        var pre = Dom.getClosest(ctx.lastElm, 'pre');
        pre && pre.setAttribute('data-lang', id);
        codeMode.language = id;
      });
    },
    syntaxHighlight: function (event) {
      var ctx = Tpl.$ctx(event.target);
      var pre = Dom.getClosest(ctx.lastElm, 'pre');
      Dom.addClass(ctx.inputElm.parentNode, 'syntaxHighlighting');
      var rt = RichText.fromHtml(pre, {includeTop: true});
      session.rpc('RichTextEditor.syntaxHighlight', pre.getAttribute('data-lang'), rt[0].slice(1).join("\n"), function (err, result) {
        Dom.removeClass(ctx.inputElm.parentNode, 'syntaxHighlighting');
        if (err) return koru.globalCallback(err);
        result[2] = rt[1][2];
        if (util.deepEqual(result, rt[1]))
          return;
        var html = RichText.toHtml(rt[0], result);
        var range = document.createRange();
        if (Dom.vendorPrefix === 'moz') {
          range.selectNode(pre);
          Dom.setRange(range);
          execCommand('insertHTML', html.firstChild.outerHTML);
        } else {
          range.selectNodeContents(pre);
          Dom.setRange(range);
          execCommand('insertHTML', html.firstChild.innerHTML);
          var innerDiv = pre.firstChild.firstChild;
          if (innerDiv && innerDiv.tagName === 'DIV' && innerDiv.nextSibling)
            execCommand('forwardDelete');
        }
        setMode(ctx, Dom.getRange());
      });
    },
    bold: false,
    italic: false,
    underline: false,
    nextSection: function (event) {
      var elm = getModeNode($.ctx, Dom.getRange().endContainer);
      if (! elm) return;
      var nextElm = elm.nextSibling;
      var range = document.createRange();
      if (nextElm) {
        normPos($.ctx.inputElm, range, elm.nextSibling, 0, 'setEnd');
        range.collapse();
        Dom.setRange(range);
      } else {
        var temp = document.createTextNode("\xa0");
        elm.parentNode.appendChild(temp);
        range.setEnd(temp, 0);
        range.collapse();
        Dom.setRange(range);
        execCommand('insertHTML', '<div><br></div>');
        temp.parentNode.removeChild(temp);
      }
    },
    previousSection: function () {
      var elm = getModeNode($.ctx, Dom.getRange().endContainer);
      if (! elm) return;
      var previousElm = elm.previousSibling;
      var range = document.createRange();
      if (previousElm) {
        normPos($.ctx.inputElm, range, elm.previousSibling, 0, 'setStart');
        range.collapse(true);
        Dom.setRange(range);
      } else {
        var temp = document.createTextNode("\xa0");
        elm.parentNode.insertBefore(temp, elm);
        range.setEnd(temp, 0);
        range.collapse();
        Dom.setRange(range);
        execCommand('insertHTML', '<div><br></div>');
        temp.parentNode.removeChild(temp);
      }
    },
    newline: function () {
      execCommand('insertText', '\n');
    },
  });

  var codeKeyMap = KeyMap(mapActions({
    language: ctrl+'L',
    bold: ctrl+'B',
    italic: ctrl+'I',
    underline: ctrl+'U',
    nextSection: ctrl+KeyMap.down,
    previousSection: ctrl+KeyMap.up,
    syntaxHighlight: ctrl+shift+'H',
    newline: "\x0d",
  }, codeActions));

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
        var ctx = Tpl.$ctx(event.target);
        notify(ctx, 'force', {});
      } : noop;
    }
    for (cmd in func) {
      func[cmd] = commandify(func[cmd], cmd);
    }
    return func;
  }


  function mapActions(keys, actions) {
    for (var name in keys) {
      keys[name] = [keys[name], actions[name]];
    }
    return keys;
  }

  Tpl.$helpers({
    attrs: function () {
      var elm = $.element;
      var options = this.options;
      for (var id in options) {
        if (id === 'type' || id[0] === '$') continue;
        (id === 'placeholder' ?
         $.ctx.inputElm : elm)
          .setAttribute(id, options[id]);
      }
      Dom.addClass(elm, 'richTextEditor');
    },
  });

  function getHtml() {
    return Dom.getMyCtx(this).inputElm.cloneNode(true);
  }

  function setHtml(value) {
    var inputElm = Dom.getMyCtx(this).inputElm;
    Tpl.clear(inputElm);
    inputElm.appendChild(value);
  }

  function focusInput(event) {
    Dom.setClass('focus', event.type === 'focusin', event.currentTarget.parentNode);
  }

  var standardMode = {
    actions: actions,
    type: 'standard',

    keyMap: keyMap,

    paste: function (htmlText) {
      var html = RichText.fromToHtml(Dom.html('<div>'+htmlText+'</div>'));
      Tpl.insert(html, 'inner') || Tpl.insert(RichText.fromHtml(html)[0].join("\n"));
    },

    keydown: function (event) {
      if (event.ctrlKey) {
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

  var codeMode = {
    actions: codeActions,
    type: 'code',

    keyMap: codeKeyMap,

    keydown:  function (event) {
      codeKeyMap.exec(event, 'ignoreFocus');
    },

    paste: function (htmlText) {
      var html = RichText.fromToHtml(Dom.html('<pre><div>'+htmlText+'</div></pre>'));
      Tpl.insert(html.firstChild.firstChild, 'inner') || Tpl.insert(RichText.fromHtml(html)[0].join("\n"));
    },
  };

  var modes = {
    standard: standardMode,
    code: codeMode,
  };

  Tpl.$extend({
    $created: function (ctx, elm) {
      Object.defineProperty(elm, 'value', {configurable: true, get: getHtml, set: setHtml});
      ctx.inputElm = elm.lastChild;
      ctx.caretMoved = makeSubject({});
      ctx.inputElm.addEventListener('focusin', focusInput);
      ctx.inputElm.addEventListener('focusout', focusInput);
      ctx.mode = standardMode;

      ctx.data.content && ctx.inputElm.appendChild(ctx.data.content);
    },

    $destroyed: function (ctx) {
      ctx.inputElm.addEventListener('focusin', focusInput);
      ctx.inputElm.addEventListener('focusout', focusInput);
      Dom.remove(ctx.selectItem);
    },

    title: function (title, action, mode) {
      return modes[mode].keyMap.getTitle(title, action);
    },

    clear: function (elm) {
      if (! Dom.hasClass(elm, 'richTextEditor'))
        elm = elm.parentNode;
      var ctx = Dom.getCtx(elm);
      var input = ctx.inputElm;
      input.setAttribute('contenteditable', 'false');
      input.textContent = '';
      input.setAttribute('contenteditable', 'true');
      Dom.remove(ctx.selectItem);
    },

    moveLeft: function (editor, mark) {
      var range = select(editor, 'char', -1);
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

    insert: function (arg, inner) {
      var range = Dom.getRange();

      if (typeof arg === 'string')
        return execCommand('insertText', arg);

      if (arg.nodeType === document.DOCUMENT_FRAGMENT_NODE) {
        var t = document.createElement('div');
        t.appendChild(arg);
        t = t.innerHTML;
      } else if (inner) {
        var t = arg.innerHTML;
      } else {
        var t = arg.outerHTML;
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
    'input': function (event) {
      var input = event.target;
      var fc = input.firstChild;
      if (fc && fc === input.lastChild && input.firstChild.tagName === 'BR')
        input.removeChild(fc);
      util.forEach(input.querySelectorAll('BLOCKQUOTE[style]'), function (elm) {
        elm.removeAttribute('style');
      });
    },
    'paste': function (event) {
      if ('clipboardData' in event) {
        var types = event.clipboardData.types;
        if (types) for(var i = 0; i < types.length; ++i) {
          var type = types[i];
          if (/html/.test(type)) {
            Dom.stopEvent();
            $.ctx.mode.paste(event.clipboardData.getData(type));
            return;
          }
        }
      }
    },

    mouseup: function () {
      var range = Dom.getRange();
      $.ctx.override = null;
      range && setMode($.ctx, range);
    },

    'click a,button': function (event) {
      event.preventDefault();
    },

    keydown: function (event) {
      var mdEditor = this.parentNode;

      switch(event.which) {
      case 229: case 16:
        return;
      }

      if (event.shiftKey) {
        if (event.which === 13) {
          event.stopImmediatePropagation();
          event.stopPropagation();
          return;
        }
      }

      $.ctx.mode.keydown.call(this, event);
    },

    keypress: function (event) {
      if (event.which === 0) return; // for firefox
      var ctx = $.ctx;

      if (ctx.mentionState != null && ctx.mentionState < 3) {
        Dom.stopEvent();
        var ch = String.fromCharCode(event.which);
        var range = Dom.getRange();
        var span = Dom.html({tag: 'span', "class": 'ln', text: ch});
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
      var mentionType = mentionKey(ctx, event.which);
      if (mentionType && event.shiftKey) {
        ctx.mentionType = mentionType;
        var range = Dom.getRange();
        if (range.startOffset !== 0) {
          if (range.startContainer.nodeType === document.TEXT_NODE) {
            var text = range.startContainer.textContent;
            text = text[range.startOffset - 1];
          } else {
            var text = range.startContainer.childNodes[range.startOffset - 1].textContent;
          }
          if (text.match(/\S/)) return;
        }
        ctx.mentionState = 1;
        return;
      }
    },

    keyup: function () {
      var ctx = $.ctx;
      if (ctx.selectItem && ! $.data(ctx.selectItem).span.parentNode) {
        Dom.remove(ctx.selectItem);
      }
      setMode(ctx, Dom.getRange());
    },
  });

  function getModeNode(ctx, elm) {
    for(var editor = ctx.inputElm; elm && elm !== editor; elm = elm.parentNode) {
      switch (elm.tagName) {
      case 'PRE':
        return elm;
      }
    }
  }

  function setMode(ctx, range) {
    var elm = range.endContainer;
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
    var range = Dom.getRange();
    if (range.endContainer.nodeType !== TEXT_NODE)
      var elm = range.endContainer.childNodes[range.endContainer.offset] || range.endContainer;
    else
      var elm = range.endContainer;


    if (! force && ctx.lastElm === elm && (! ctx.override || (range.collapsed && ctx.lastOffset === range.endOffset))) return;

    ctx.override = override;
    ctx.lastElm = elm;
    ctx.lastOffset = range.endOffset;

    ctx.caretMoved.notify(override);
  }

  function mentionKey(ctx, code) {
    var mentions = ctx.data.extend;
    mentions = mentions && mentions.mentions;
    if (! mentions) return;
    var id = String.fromCharCode(code);
    if (mentions[id])
      return id;
  }

  function getTag(tag) {
    var range = Dom.getRange();
    if (range === null) return null;
    var start = range.endContainer;
    return Dom.searchUpFor(start, function (elm) {
      return elm.tagName === tag;
    }, 'richTextEditor');
  }

  function execCommand (cmd, value) {
    return document.execCommand(cmd, false, value);
  }

  function move(editor, type, amount) {
    var range = select(editor, type, amount);
    range.collapse(amount < 0);
    Dom.setRange();
    return range;
  }

  function select(editor, type, amount) {
    var range = Dom.getRange();
    var obj = {node: range.startContainer, offset: range.startOffset};

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
    var other;
    var node = obj.node;
    var offset = obj.offset;

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
    var other;
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
    var other;
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
    var other;
    var node = obj.node;
    var offset = obj.offset;

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
    var range = Dom.getRange();
    if (range.startContainer.nodeType !== TEXT_NODE)
      return;
    var offset = range.startOffset;
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
      var curr = node.childNodes[offset];
      if (curr.tagName === 'BR') {
        range[setter](curr, 0);
        return;
      }
      curr = (curr && firstInnerMostNode(curr)) || lastInnerMostNode(node.childNodes[offset - 1]);
      if (curr.nodeType !== TEXT_NODE && curr.tagName !== 'BR') {
        var obj = {node: node, offset: offset};
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
    var trace = [];
    while (node !== editor) {
      trace.push(node);
      node = node.parentNode;
    }
    if (! wrt) return trace;
    var wrtIdx = wrt.length - 1;
    var traceIdx = trace.length - 1;
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
    var last = node;
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
    var node = range.startContainer;
    if (node.nodeType !== TEXT_NODE) return;
    var offset = range.startOffset;
    var other, parent = node.parentNode;
    while ((other = node.previousSibling) && other.nodeType === TEXT_NODE) {
      node.textContent = other.textContent + node.textContent;
      offset += other.textContent.length;
      parent.removeChild(other);
    }
    while ((other = node.nextSibling) && other.nodeType === TEXT_NODE) {
      node.textContent = node.textContent + other.textContent;
      parent.removeChild(other);
    }
    node.textContent = fixSpaces(node.textContent);
    node.textContent.length || killNode();
    range.setStart(node, offset);
    range.collapse(true);

    function killNode() {
      var other = node.nextSibling;
      offset = 0;
      if (! other) {
        other = node.previousSibling;
        other = other && lastInnerMostNode(other);
        if (other && other.nodeType === TEXT_NODE)
          offset =  other.textContent.length;
      }
      parent.removeChild(node);
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
    richTextEditor: function (content, options) {
      return Tpl.$autoRender({content: content, options: options});
    }
  });

  RichTextMention.init(Tpl);

  Link.$extend({
    cancel: function (elm) {
      Dom.remove(elm);
    },

    $destroyed: function (ctx) {
      Dom.setRange(ctx.data.range);
      ctx.data.inputElm.focus();
    },
  });

  Link.$events({
    'submit': function (event) {
      Dom.stopEvent();
      var inputs = this.getElementsByTagName('input');

      var data = $.ctx.data;
      Dom.setRange(data.range);
      data.inputElm.focus();
      var href  = inputs[1].value;
      Tpl.insert(Dom.h({a: inputs[0].value || href, $href: href}));
      Dom.remove(event.currentTarget);
    },
  });

  function codeNode(editor, range) {
    for(var node = range.startContainer; node && node !== editor; node = node.parentNode) {
      if (node.nodeType === 1 && node.getAttribute('face') === 'monospace') {
        return (range.collapsed || Dom.contains(node, range.endContainer)) && node;
      }
    }
  }

  Tpl.TextColor.$events({
    'click button': function (event) {
      Dom.stopEvent();
      this.focus();
      var type = this.getAttribute('name');
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

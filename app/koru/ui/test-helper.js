define(function(require, exports, module) {
  var TH = require('../test-helper');
  var koru = require('../main');
  var Route = require('./route');
  var util = require('../util');
  var Dom = require('../dom');

  koru.onunload(module, function () {
    Route.history = TH._orig_history;
  });

  Route._orig_history = Route.history;
  Route.history = {
    pushState: function () {},
    replaceState: function () {},
    back: function () {},
  };

  var geddon = TH.geddon;

  var ga = geddon.assertions;

  ga.add('rangeEquals', {
    assert: function (startContainer, startOffset, endContainer, endOffset) {
      if (endContainer === undefined) {
        endContainer = startContainer;
        endOffset = startOffset;
      }

      var range = Dom.getRange();

      this.actual = {
        startContainer: range.startContainer,
        startOffset: range.startOffset,
        endContainer: range.endContainer,
        endOffset: range.endOffset,
      };
      this.expected = {
        startContainer: startContainer,
        startOffset: startOffset,
        endContainer: endContainer,
        endOffset: endOffset,
      };

      return geddon._u.deepEqual(this.actual, this.expected, this, 'diff');
    },

    message: "{i$actual} to equal {i$expected}\nDiff at\n -> {i$diff}",
  });

  TH.util.extend(TH, {
    domTearDown: function () {
      Dom.flushNextFrame();
      Route._reset();
      Dom.removeChildren(document.body);
      document.body.className = '';
      delete Dom.Test;
    },

    stubAfTimeout: function () {
      if (koru.afTimeout.restore)
        koru.afTimeout.restore();
      else
        TH.geddon.test.stub(koru, 'afTimeout').returns(koru.nullFunc);
    },

    yieldAfTimeout: function () {
      koru.afTimeout.yield();
      koru.afTimeout.reset();
    },

    createMockEvent: function(currentTarget, options) {
      return util.extend(util.extend({}, {
        preventDefault: geddon.test.stub(),
        stopImmediatePropagation: geddon.test.stub(),
        currentTarget: currentTarget,
      }), options || {});
    },

    setColor: function (node, value) {
      TH.click(node);
      assert.elideFromStack.dom(document.body, function () {
        assert.dom('#ColorPicker', function () {
          TH.input('input[name=hex]', value);
          TH.click('[name=apply]');
        });
      });
      return this;
    },

    findDomEvent: function (template, type) {
      return template._events.filter(function (event) {
        return event[0] === type;
      });
    },

    input: function (node, value) {
      if (typeof node === 'string') {
        var args = util.slice(arguments);
        value = args[args.length -1];
        args[args.length -1 ] = function () {
          TH.input(this, value);
        };
        assert.elideFromStack.dom.apply(assert, args);
      } else {
        if ('value' in node)
          node.value = value;
        else
          node.textContent = value;

        this.trigger(node, 'input');
      }
      return this;
    },

    keypress: function (elm, keycode, modifiers) {
      if (typeof keycode === 'string') keycode = keycode.charCodeAt(0);
      modifiers = modifiers || '';


      var pressEvent = document.createEvent ("KeyboardEvent");  //https://developer.mozilla.org/en/DOM/event.initKeyEvent



      if ('initKeyboardEvent' in pressEvent) {
        if (Dom.vendorPrefix === 'ms')
          pressEvent.initKeyboardEvent("keypress", true, true, window,
                                       keycode, null, modifiers, false, "");
        else {
          pressEvent.initKeyboardEvent("keypress", true, true, window,
                                       keycode, null,  has(/ctrl/), has(/alt/), has(/shift/), has(/meta/));
        }

        // Chromium Hack
        Object.defineProperty(pressEvent, 'which', {get : function() {return keycode}});

      } else {
        // firefox
        pressEvent.initKeyEvent ("keypress", true, true, window,
                                 has(/ctrl/), has(/alt/), has(/shift/), has(/meta/),
                                 keycode, keycode);
      }
      dispatchEvent(elm, pressEvent);
      return this;

      function has(re) {return !! modifiers.match(re)};
    },

    dispatchEvent: dispatchEvent,

    change: function (node, value) {
      if (typeof node === 'string') {
        var args = util.slice(arguments);
        value = args[args.length -1];
        args[args.length -1 ] = function () {
          TH.change(this, value);
        };
        assert.elideFromStack.dom.apply(assert, args);
      } else {
        node.value = value;
        this.trigger(node, 'change');
      }
      return this;
    },

    trigger: function (node, event, args) {
      if (typeof node === 'string') {
        assert.elideFromStack.dom(node, function () {
          TH.trigger(this, event, args);
        });
      } else {
        assert.elideFromStack(node,'node not found');
        return Dom.triggerEvent(node, event, args);
      }
    },

    buildEvent: Dom.buildEvent,

    keydown: function (node, key, args) {
      keyseq('keydown', node, key, args);
    },

    keyup: function (node, key, args) {
      keyseq('keyup', node, key, args);
    },

    click: function(node) {
      if (typeof node === 'string') {
        var args = util.slice(arguments);
        args.push(function () {
          TH.click(this);
        });
        assert.elideFromStack.dom.apply(assert, args);
      } else {
        if (node.click)
          node.click(); // supported by form controls cross-browser; most native way
        else
          TH.trigger(node, 'click');
      }
      return this;
    },

    mouseDownUp: function (node, args) {
      if (typeof node === 'string') {
        assert.elideFromStack.dom(node, function () {
          node = this;
        });
      }
      TH.trigger(node, 'mousedown', args);
      TH.trigger(node, 'mouseup', args);
    },

    setRange: function (startContainer, startOffset, endContainer, endOffset) {
      if (endContainer === undefined) {
        endContainer = startContainer;
        if (startOffset === undefined) {
          startOffset = 0;
          endOffset = startContainer[startContainer.nodeType === document.TEXT_NODE ?
                                     'childNodes' : 'textContent'].length;
        }else
          endOffset = startOffset;
      }
      var range = document.createRange();
      range.setStart(startContainer, startOffset);
      range.setEnd(endContainer, endOffset);
      Dom.setRange(range);
      return range;
    },
  });

  function keyseq(event, node, key, args) {
    if (args === undefined && typeof key === 'object') {
      args = key;
      key = node;
      node = document.body;
    } else if (key === undefined) {
      key = node;
      node = document.body;
    }
    args = args || {};
    switch (typeof key) {
    case 'string':
      for(var i = 0; i < key.length; ++i) {
        args.which = key.charCodeAt(i);
        TH.trigger(node, event, args);
      }
      break;
    case 'number':
      args.which = key;
      TH.trigger(node, event, args);
      break;
    default:
      throw new Error("invalid key");
    }
  }

  var ga = TH.geddon.assertions;


  function dispatchEvent(elm, event) {
    var old_unhandledException = koru.unhandledException;
    var evex;
    koru.unhandledException = unhandledException;
    try {
      elm.dispatchEvent(event);
      if (evex) {
        koru.error(util.extractError(evex));
        throw new Error("event Dispatch => " + evex);
      }
    } finally {
      koru.unhandledException = old_unhandledException;
    }

    function unhandledException(ex) {evex = ex}
  }

  return TH;
});

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
    pushState() {},
    replaceState() {},
    back() {},
  };

  var geddon = TH.geddon;

  var ga = geddon.assertions;

  ga.add('rangeEquals', {
    assert(startContainer, startOffset, endContainer, endOffset) {
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
      var expected = {
        startContainer: startContainer,
        startOffset: startOffset,
        endContainer: endContainer,
        endOffset: endOffset,
      };

      return geddon._u.deepEqual(this.actual, expected, this, 'diff');
    },

    assertMessage: "range to be equal{$diff}",
    refuteMessage: "range tp be equal\n  {i$actual}",
  });

  function domEvent(eventName, func) {
    return trigger;
    function trigger(node, arg1, arg2) {
      var value = arg1;
      if (typeof node === 'string') {
        var func1 = function () {node = this};
        if (arg2 === undefined) {
          assert.elideFromStack.dom(node, func1);
        } else {
          value = arg2;
          assert.elideFromStack.dom(node, arg1, func1);
        }
      }
      func(node, value);
      TH.trigger(node, eventName);
      return this;
    }
  }

  TH.util.extend(TH, {
    domTearDown() {
      Dom.flushNextFrame();
      Route._reset();
      Dom.removeChildren(document.body);
      document.body.className = '';
      Dom.Test = null;
    },

    stubAfTimeout() {
      if (koru.afTimeout.restore)
        koru.afTimeout.restore();
      else
        TH.geddon.test.stub(koru, 'afTimeout').returns(koru.nullFunc);
    },

    yieldAfTimeout() {
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

    setColor(node, value) {
      TH.click(node);
      assert.elideFromStack.dom(document.body, function () {
        assert.dom('#ColorPicker', function () {
          TH.input('input[name=hex]', value);
          TH.click('[name=apply]');
        });
      });
      return this;
    },

    findDomEvent(template, type) {
      return template._events.filter(function (event) {
        return event[0] === type;
      });
    },

    input: domEvent('input', function (node, value) {
      if ('value' in node)
        node.value = value;
      else
        node.textContent = value;
    }),

    keypress(elm, keycode, modifiers) {
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

    change: domEvent('change', function (node, value) {
      if ('value' in node)
        node.value = value;
      else
        node.textContent = value;
    }),

    trigger(node, event, args) {
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

    keydown(node, key, args) {
      keyseq('keydown', node, key, args);
    },

    keyup(node, key, args) {
      keyseq('keyup', node, key, args);
    },

    click: function(node, arg1) {
      if (typeof node === 'string') {
        assert.elideFromStack.dom(node, arg1, function () {TH.click(this)});
      } else {
        if (node.click)
          node.click(); // supported by form controls cross-browser; most native way
        else
          TH.trigger(node, 'click');
      }
      return this;
    },

    mouseDownUp(node, args) {
      if (typeof node === 'string') {
        assert.elideFromStack.dom(node, function () {
          node = this;
        });
      }
      TH.trigger(node, 'mousedown', args);
      TH.trigger(node, 'mouseup', args);
    },

    setRange(startContainer, startOffset, endContainer, endOffset) {
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

    selectMenu(node, value, func) {
      TH.trigger(node, 'mousedown');
      TH.click(node);
      const pre = TH.geddon.__elidePoint;
      if (typeof value === 'string') {
        const id = value;
        value = TH.match(arg => (arg._id || arg.id) === id);
      }
      assert.elideFromStack.dom(document.body, function () {
        assert.dom('body>.glassPane>#SelectMenu', function () {
          assert.dom('li', {data: value}, li => {
            if (func) {
              TH.geddon.__elidePoint = pre;
              func.call(li);
            } else
              TH.click(li);
          });
        });
      });
      return this;
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

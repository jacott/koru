define(function(require, exports, module) {
  const Dom   = require('../dom');
  const koru  = require('../main');
  const TH    = Object.create(require('../test-helper'));
  const util  = require('../util');
  const Route = require('./route');

  koru.onunload(module, function () {
    Route.history = TH._orig_history;
  });

  Route._orig_history = Route.history;
  Route.history = {
    pushState() {},
    replaceState() {},
    back() {},
  };

  const geddon = TH.geddon;
  const ga = geddon.assertions;

  ga.add('rangeEquals', {
    assert(startContainer, startOffset, endContainer, endOffset) {
      if (endContainer === undefined) {
        endContainer = startContainer;
        endOffset = startOffset;
      }

      const range = Dom.getRange();

      this.actual = {
        startContainer: range.startContainer,
        startOffset: range.startOffset,
        endContainer: range.endContainer,
        endOffset: range.endOffset,
      };
      const expected = {
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
      let value = arg1;
      if (typeof node === 'string') {
        const func1 = function () {node = this};
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

  module.exports = util.merge(TH, {
    domTearDown() {
      Dom.flushNextFrame();
      Route._reset();
      Dom.removeChildren(document.body);
      document.body.removeAttribute('class');
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
      return util.merge(util.merge({}, {
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
      return template._events.filter(event => event[0] === type);
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


      const pressEvent = document.createEvent ("KeyboardEvent");  //https://developer.mozilla.org/en/DOM/event.initKeyEvent



      if ('initKeyboardEvent' in pressEvent) {
        if (Dom.vendorPrefix === 'ms')
          pressEvent.initKeyboardEvent("keypress", true, true, window,
                                       keycode, null, modifiers, false, "");
        else {
          pressEvent.initKeyboardEvent("keypress", true, true, window,
                                       keycode, null,  has(/ctrl/), has(/alt/), has(/shift/), has(/meta/));
        }

        // Chromium Hack
        Object.defineProperty(pressEvent, 'which', {get() {return keycode}});

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
        assert.elideFromStack.msg('node not found')(node);
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

    pointerDownUp(node, args) {
      if (typeof node === 'string') {
        if (typeof args === 'string') {
          assert.elideFromStack.dom(node, args, function () {node = this});
          TH.trigger(node, 'pointerdown');
          TH.trigger(node, 'pointerup');
          return;
        }
        assert.elideFromStack.dom(node, function () {node = this});
      }
      TH.trigger(node, 'pointerdown', args);
      TH.trigger(node, 'pointerup', args);
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
      const range = document.createRange();
      range.setStart(startContainer, startOffset);
      range.setEnd(endContainer, endOffset);
      Dom.setRange(range);
      return range;
    },

    selectMenu(node, value, func) {
      TH.trigger(node, 'pointerdown');
      const menu = Dom('body>.glassPane>#SelectMenu') ||
            (TH.click(node), Dom('body>.glassPane>#SelectMenu'));
      if (! menu)
        assert.elideFromStack(false, "Can't find #SelectMenu");
      const pre = TH.geddon.__elidePoint;
      switch(typeof value) {
      case 'string':
      case 'number':
        const id = value;
        value = TH.match(arg => (arg._id || arg.id) === id, {toString() {return `id of '${id}'`}});
        break;
      }
      assert.elideFromStack.dom(menu, function () {
        assert.dom('li', {data: value}, li => {
          TH.geddon.__elidePoint = pre;
          switch (typeof func) {
          case 'function':
            if (func.call(li, li)) TH.pointerDownUp(li);
            break;
          case 'object':
            if (func.menu) {
              assert.dom(li.parentNode, menu => {
                if (func.menu.call(menu, menu, li))
                  TH.pointerDownUp(li);;
              });
              break;
            }
          default:
            TH.pointerDownUp(li);
          }
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
      for(let i = 0; i < key.length; ++i) {
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

  function dispatchEvent(elm, event) {
    const old_unhandledException = koru.unhandledException;
    let evex;
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
});

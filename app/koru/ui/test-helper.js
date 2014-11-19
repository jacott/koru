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

  TH.util.extend(TH, {
    domTearDown: function () {
      Dom.removeChildren(document.body);
      document.body.className = '';
      delete Dom.Test;
    },

    createMockEvent: function(currentTarget, options) {
      return util.extend(util.extend({}, {
        preventDefault: geddon.test.stub(),
        stopImmediatePropagation: geddon.test.stub(),
        currentTarget: currentTarget,
      }), options || {});
    },

    buildEvent: function (event, args) {
      if (document.createEvent) {
        var e = document.createEvent("Event");
        e.initEvent(event, true, true);
        util.extend(e, args);
      } else {
        var e = document.createEventObject();
        e.__name = event;
        util.extend(e, args);
      }
      return e;
    },

    setColor: function (node, value) {
      TH.click(node);
      assert.elideFromStack(document.getElementById('ColorPicker'));
      Dom.ColorPicker._cp.setHex(value);
      assert.elideFromStack.dom(document.getElementById('confirmDialog'), function () {
        TH.click('[name=apply]');
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

    keypress: function (elm, keycode, shift, ctrl, alt, meta) {
      if (typeof keycode === 'string') keycode = keycode.charCodeAt(0);

      var pressEvent = document.createEvent ("KeyboardEvent");  //https://developer.mozilla.org/en/DOM/event.initKeyEvent

      if ('initKeyboardEvent' in pressEvent) {
        pressEvent.initKeyboardEvent("keypress", true, true, window,
                                     null, null,
                                     ctrl, alt, shift, meta);
        // Chromium Hack
        Object.defineProperty(pressEvent, 'which', {get : function() {return keycode}});

      } else {
        // firefox
        pressEvent.initKeyEvent ("keypress", true, true, window,
                                 ctrl, alt, shift, meta,
                                 keycode, keycode);
      }
      dispatchEvent(elm ,pressEvent);
      return this;
    },

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

        if (typeof event === 'string') {
          if (event === 'mousewheel')
            event = Dom.MOUSEWHEEL_EVENT;
          event =  this.buildEvent(event, args);
        }

        if (document.createEvent) {
          dispatchEvent(node, event);
        } else {
          node.fireEvent("on" + event.__name, event);
        }
        return event;
      }
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

  });

  function dispatchEvent(elm, event) {
    var old_unhandledException = koru.unhandledException;
    var evex;
    koru.unhandledException = unhandledException;
    try {
      elm.dispatchEvent (event);
      if (evex) throw evex;
    } finally {
      koru.unhandledException = old_unhandledException;
    }

    function unhandledException(ex) {evex = ex}
  }

  return TH;
});

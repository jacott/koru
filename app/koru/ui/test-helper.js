define((require, exports, module)=>{
  'use strict';
  const Dom             = require('../dom');
  const koru            = require('../main');
  const BaseTH          = require('../test-helper');
  const Route           = require('./route');

  const {stub, spy, util, Core, match: m} = BaseTH;

  Route._orig_history = Route.history;
  Route.history = {
    pushState() {},
    replaceState() {},
    back() {},
  };

  koru.onunload(module, ()=>{Route.history = BaseTH._orig_history});

  const keyseq = (event, node, key, args)=>{
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
  };

  const dispatchEvent = (elm, event)=>{elm.dispatchEvent(event)};

  const ga = Core.assertions;

  ga.add('rangeEquals', {
    assert(
      range,
      startContainer, startOffset=0,
      endContainer=startContainer, endOffset=startOffset
    ) {
      if (typeof endContainer === 'number') {
        endOffset = endContainer;
        endContainer = startContainer;
      }

      if (util.isSafari) {
        const orig = Dom.getRange();
        if (range == null)
          range = orig;
        else {
          Dom.setRange(range);
          range = Dom.getRange();
        }
        let exp = document.createRange();
        exp.setStart(startContainer, startOffset);
        exp.setEnd(endContainer, endOffset);

        Dom.setRange(exp);
        exp = Dom.getRange();

        startContainer = exp.startContainer;
        startOffset = exp.startOffset;
        endContainer = exp.endContainer;
        endOffset = exp.endOffset;

        Dom.setRange(orig);
      } else if (range == null) {
        range = Dom.getRange();
      }

      this.actual = {
        startContainer: range.startContainer,
        startOffset: range.startOffset,
        endContainer: range.endContainer,
        endOffset: range.endOffset,
      };
      const expected = {
        startContainer: m.is(startContainer),
        startOffset,
        endContainer: m.is(endContainer),
        endOffset,
      };

      return Core.deepEqual(this.actual, expected, this, 'diff');
    },

    assertMessage: "range to be equal{$diff}",
    refuteMessage: "range to be equal\n  {i$actual}",
  });

  const domEvent = (eventName, func)=>{
    return trigger;
    function trigger(node, arg1, arg2) {
      let value = arg1;
      if (typeof node === 'string') assert.elide(()=>{
        const func1 = function () {node = this};
        if (arg2 === undefined) {
          assert.dom(node, func1);
        } else {
          value = arg2;
          assert.dom(node, arg1, func1);
        }
      });
      func(node, value);
      TH.trigger(node, eventName);
      return this;
    }
  };

  const TH = {
    __proto__: BaseTH,

    domTearDown() {
      Dom.flushNextFrame();
      Route._reset();
      Dom.removeChildren(document.body);
      document.body.removeAttribute('class');
      document.body.removeAttribute('style');
      Dom.tpl.Test = null;
    },

    stubAfTimeout() {
      if (koru.afTimeout.restore)
        koru.afTimeout.restore();

      stub(koru, 'afTimeout').returns(koru.nullFunc);
    },

    yieldAfTimeout: ()=>{koru.afTimeout.yieldAndReset()},

    createMockEvent(currentTarget, options={}) {
      return Object.assign({}, {
        preventDefault: stub(),
        stopImmediatePropagation: stub(),
        currentTarget: currentTarget,
      }, options);
    },

    setColor(node, value) {
      TH.click(node);
      assert.elide(()=>{assert.dom(document.body, () => {
        assert.dom('#ColorPicker', () => {
          TH.input('input[name=hex]', value);
          TH.click('[name=apply]');
        });
      });});
      return this;
    },

    findDomEvent(template, type) {
      return template._events.filter(event => event[0] === type);
    },

    input: domEvent('input', (node, value) => {
      if ('value' in node)
        node.value = value;
      else
        node.textContent = value;
    }),

    keypress(elm, keycode, modifiers='') {
      const has = re => !! modifiers.match(re);

      if (typeof keycode === 'string') keycode = keycode.charCodeAt(0);

      const pressEvent = document.createEvent("KeyboardEvent");
      //https://developer.mozilla.org/en/DOM/event.initKeyEvent

      if ('initKeyboardEvent' in pressEvent) {
        if (Dom.vendorPrefix === 'ms')
          pressEvent.initKeyboardEvent("keypress", true, true, window,
                                       keycode, null, modifiers, false, "");
        else {
          pressEvent.initKeyboardEvent(
            "keypress", true, true, window,
            keycode, null,  has(/ctrl/), has(/alt/), has(/shift/), has(/meta/));
        }

        // Chromium Hack
        Object.defineProperty(pressEvent, 'which', {get() {return keycode}});

      } else {
        // firefox
        pressEvent.initKeyEvent("keypress", true, true, window,
                                has(/ctrl/), has(/alt/), has(/shift/), has(/meta/),
                                keycode, keycode);
      }
      dispatchEvent(elm, pressEvent);
      return this;
    },

    dispatchEvent,

    change: domEvent('change', (node, value)=>{
      if ('value' in node)
        node.value = value;
      else
        node.textContent = value;
    }),

    trigger(node, event, args) {
      assert.elide(()=>{
        if (typeof node === 'string') {
          assert.dom(node, node =>{Dom.triggerEvent(node, event, args)});
        } else {
          assert.msg('node not found')(node);
          return Dom.triggerEvent(node, event, args);
        }
      });
      return this;
    },

    buildEvent: Dom.buildEvent,

    keydown(node, key, args) {
      keyseq('keydown', node, key, args);
    },

    keyup(node, key, args) {
      keyseq('keyup', node, key, args);
    },

    click(node, arg1) {
      assert.elide(()=>{
        if (typeof node === 'string') {
          assert.dom(node, arg1, elm =>{TH.click(elm)});
        } else {
          if (node.click)
            node.click(); // supported by form controls cross-browser; most native way
          else
            TH.trigger(node, 'click');
        }
      });
      return this;
    },

    pointerDownUp(node, args={pointerId: 1}) {
      assert.elide(()=>{
        if (typeof node === 'string') {
          if (typeof args === 'string') {
            assert.dom(node, args, elm=>{node = elm});
            TH.trigger(node, 'pointerdown');
            TH.trigger(node, 'pointerup');
            return;
          }
          assert.dom(node, elm=>{node = elm});
        }
        TH.trigger(node, 'pointerdown', args);
        TH.trigger(node, 'pointerup', args);
      });
      return this;
    },

    setRange(startContainer, startOffset, endContainer, endOffset) {
      if (endContainer === undefined) {
        endContainer = startContainer;
        if (startOffset === undefined) {
          startOffset = 0;
          endOffset = startContainer.nodeType === document.TEXT_NODE
            ? startContainer.nodeValue.length : startContainer.childNodes.length;
        } else
          endOffset = startOffset;
      }
      const range = document.createRange();
      range.setStart(startContainer, startOffset);
      range.setEnd(endContainer, endOffset);
      Dom.setRange(range);
      return range;
    },

    selectMenu(node, value, func) {
      TH.click(node);
      const menu = Dom('body>.glassPane>#SelectMenu');
      if (! menu)
        assert.fail("Can't find #SelectMenu", 1);
      switch(typeof value) {
      case 'string':
      case 'number':
        const id = value;
        value = m(arg => arg._id === id, {toString() {return `id of '${id}'`}});
        break;
      }
      assert.elide(()=>{assert.dom(menu, ()=>{
        assert.dom('li', {data: value}, li => {
          switch (typeof func) {
          case 'function':
            if (func.call(li, li)) TH.click(li);
            break;
          case 'object':
            if (func.menu) {
              assert.dom(li.parentNode, menu => {
                if (func.menu.call(menu, menu, li))
                  TH.click(li);;
              });
              break;
            }
          default:
            TH.click(li);
          }
        });
      });});
      return this;
    },

    matchData: (attrs)=> ({data: m(o => {
      for (const name in attrs) {
        if (! Core.deepEqual(o[name], attrs[name])) return false;
      }
      return true;
    }, () => util.inspect(attrs))}),

    getSimpleBoundingRect: object =>{
      const rect = Dom.getBoundingClientRect(object);
      return rect && {left: rect.left, top: rect.top, width: rect.width, height: rect.height};
    },
  };

  return TH;
});

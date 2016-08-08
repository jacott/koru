isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('koru/test');
  var Dom = require('../dom');
  var util = require('koru/util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
      delete Dom.Foo;
      Dom.removeChildren(document.body);
    },

    "test onMouseUp": function () {
      Dom.newTemplate({name: 'Foo', nodes: [{
        name: 'div', children: [
          {name: 'span'},
        ]
      }]});
      Dom.Foo.$events({
        'mousedown span': function (event) {
          Dom.onMouseUp(function (e2) {
            v.ctx = Dom.current.ctx;
            v.target = e2.target;
          });
        },
      });

      document.body.appendChild(Dom.Foo.$autoRender({}));

      assert.dom('div>span', function () {
        trigger(this, 'mousedown');
        trigger(this, 'mouseup');

        assert.same(v.ctx, Dom.Foo.$ctx(this));
        assert.same(v.target, this);

        v.ctx = null;

        trigger(this, 'mouseup');

        assert.same(v.ctx, null);
      });
    },

    "test modifierKey"() {
      refute(Dom.modifierKey({}));
      assert(Dom.modifierKey({ctrlKey: true}));
      assert(Dom.modifierKey({shiftKey: true}));
      assert(Dom.modifierKey({metaKey: true}));
      assert(Dom.modifierKey({altKey: true}));
    },
  });

  function trigger(elm, event, args) {
    if (typeof event === 'string') {
      var e = document.createEvent("Event");
      e.initEvent(event, true, true);
      util.extend(e, args);
      event =  e;
    }

    elm.dispatchEvent(event);

    return event;
  }
});

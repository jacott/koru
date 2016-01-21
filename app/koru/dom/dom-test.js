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

    "test inputValue helper": function () {
      var elm = Dom._private.currentElement = {};
      TH.stubProperty(elm, 'value', {get: function () {return '34'}, set: v.stub = test.stub()});
      Dom._helpers.inputValue('foo');

      assert.calledWith(v.stub, 'foo');

      Dom._helpers.inputValue();

      assert.calledWith(v.stub, '');

      v.stub.reset();
      Dom._helpers.inputValue(34);

      refute.called(v.stub);
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

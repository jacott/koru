isClient && define(function (require, exports, module) {
  const Dom             = require('../dom');
  const completeListTpl = require('../html!./complete-list-test');
  const util            = require('../util');
  const TH              = require('./test-helper');

  require('./complete-list');
  var test, v;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      v.CompleteList = Dom.newTemplate(util.deepCopy(completeListTpl));
    },

    tearDown() {
      TH.domTearDown();
      v = null;
    },

    "test rendering"() {
      assert.dom(v.CompleteList.$autoRender({}), function () {
        assert.dom('[name=name]', function () {
          Dom.Form.completeList({input: v.input = this, completeList: [{name: 'abc'}, {name: 'def'}]});
        });
      });
      assert.dom('body>ul.ui-ul.complete', function () {
        assert.dom('li.selected', 'abc');
        assert.dom('li', 'def');
      });
      assert.dom(v.input, function () {
        Dom.Form.completeList({input: this, completeList: [{name: 'foo'}]});
      });
      refute.dom('li', 'abc');
      assert.dom('body>ul.complete', function () {
        assert.dom('li', 'foo');
      });

      assert.dom(v.input, function () {
        Dom.Form.completeList({input: this});
      });
      refute.dom('.complete');
    },

    "callback": {
      setUp() {
        document.body.appendChild(v.CompleteList.$autoRender({}));
        assert.dom('[name=name]', function () {
          Dom.Form.completeList({input: this,  completeList: v.list = [{name: 'abc'}, {name: 'def'}], callback: v.callback = test.stub()});
        });

        v.inp = document.querySelector('[name=name]');
      },

      "test clicking"() {
        assert.dom('li', 'abc', function () {
          TH.trigger(this, 'pointerdown');
        });

        refute.dom('.complete');

        assert.calledWith(v.callback, v.list[0]);

        assert.dom('[name=name]', {value: ''}, function () {
          Dom.Form.completeList({input: this,  completeList: v.list = [{name: 'abc'}, {name: 'def'}]});
        });
        assert.dom('li', 'abc', function () {
          TH.trigger(this, 'pointerdown');
        });
        assert.dom('[name=name]', {value: 'abc'});
      },

      "test enter no select"() {
        TH.trigger(v.inp, 'keydown', {which: 65});
        assert.dom('.complete');

        var inpCallback = test.stub();
        v.inp.addEventListener('keydown', inpCallback);
        test.onEnd(function () {
          v.inp.removeEventListener('keydown', inpCallback);
        });

        TH.trigger(v.inp, 'keydown', {which: 13});

        refute.dom('.complete');

        assert.calledWith(v.callback, v.list[0]);

        refute.called(inpCallback);
      },

      "test enter after select"() {
        TH.trigger(v.inp, 'keydown', {which: 40}); // down
        TH.trigger(v.inp, 'keydown', {which: 13});

        refute.dom('.complete');

        assert.calledWith(v.callback, v.list[1]);
      },

      "test up/down arrow"() {
        assert.dom('.complete', function () {
          assert.dom('li.selected', 'abc');
          TH.trigger(v.inp, 'keydown', {which: 40}); // down
          assert.dom('li.selected', 'def');

          TH.trigger(v.inp, 'keydown', {which: 38}); // up
          assert.dom('li.selected', 'abc');
        });

      },
    },

    "test blur"() {
      document.body.appendChild(v.CompleteList.$autoRender({}));
      assert.dom('[name=name]', function () {
        Dom.Form.completeList({input: this,  completeList: [{name: 'abc'}, {name: 'def'}]});
        TH.trigger(this, 'blur');
      });
      refute.dom('ul');

      assert.dom('[name=name]', function () {
        Dom.Form.completeList({noBlur: true, input: this,  completeList: [{name: 'abc'}, {name: 'def'}]});
        TH.trigger(this, 'blur');
      });
      assert.dom('ul');
    },
  });
});

isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./modal');
  var Dom = require('../dom');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    // see SelectMenu for more comprehensive testing of positioning

    "test appendBelow": function () {
      test.stub(sut, 'append');

      sut.appendBelow('gp', 'origin');

      assert.calledWith(sut.append, 'below', 'gp', 'origin');
    },

    "test appendAbove": function () {
      test.stub(sut, 'append');

      sut.appendAbove('gp', 'origin');

      assert.calledWith(sut.append, 'above', 'gp', 'origin');
    },

    "test popup": function () {
      test.spy(sut, '_init');
      var page = Dom.html({content: ['text', {tag: 'input'}]});
      document.body.appendChild(page);
      var popup = Dom.html({class: 'popup', style: 'position:absolute', text: 'popup'});
      assert.dom('input', function () {
        sut.appendBelow(document.body, this, popup);
        v.ibox = this.getBoundingClientRect();
      });
      assert.dom('body', function () {
        assert.dom('>.popup', function () {
          assert.cssNear(this, 'left', v.ibox.left);
          assert.cssNear(this, 'top', v.ibox.top + v.ibox.height);
        });
      });
      refute.called(sut._init);
    },

    "test nesting": function () {
      test.spy(sut, '_init');
      var page = Dom.html({content: ['text', {tag: 'input'}]});
      document.body.appendChild(page);
      var popup = Dom.html({class: 'glassPane', content: {class: 'popup', style: 'position:absolute', text: 'popup'}});
      Dom.setCtx(popup);
      var popup2 = Dom.html({class: 'glassPane', content: {class: 'popup2', style: 'position:absolute', text: 'popup2'}});
      Dom.setCtx(popup2);
      assert.dom('input', function () {
        sut.appendBelow(popup, this);
        sut.appendBelow(popup2, popup);
        v.ibox = this.getBoundingClientRect();
      });
      assert.dom('body', function () {
        assert.dom('>.glassPane:nth-last-child(2)>.popup', function () {
          assert.cssNear(this, 'left', v.ibox.left);
          assert.cssNear(this, 'top', v.ibox.top + v.ibox.height);
        });
        assert.dom('>.glassPane:last-child>.popup2', function () {
          assert.same(this, popup2.firstChild);
        });
        TH.trigger(this, 'keydown', {which: 27});
        assert.dom('>.glassPane:last-child>.popup', function () {
          assert.same(this, popup.firstChild);
        });
        TH.trigger(this, 'keydown', {which: 27});
        refute.dom('.glassPane');
      });
      assert.calledTwice(sut._init);
    },
  });
});

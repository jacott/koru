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
      });
      assert.dom('body', function () {
        assert.dom('>.popup', function () {
          assert.cssNear(this, 'left', 21);
          assert.cssNear(this, 'top', 19);
        });
      });
      refute.called(sut._init);
      debugger;
    },
  });
});
define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var uColor = require('./util-color');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test hex2rgb": function () {
      assert.equals(uColor.hex2rgb('#11aadd'), {r: 17, g: 170, b: 221});

      assert.equals(uColor.hex2rgb('foo'), {r: 0, g: 0, b: 0});
    },

    "test rgb2hex": function () {
      assert.equals(uColor.rgb2hex({r: 17, g: 170, b: 221}), '#11aadd');
    },

    "test rgb2hsl": function () {
      var hsl = uColor.rgb2hsl('#11aadd');
      assert.near(hsl.h, 0.542, 0.001);
      assert.near(hsl.s, 0.857, 0.001);
      assert.near(hsl.l, 0.467, 0.001);

      assert.equals(uColor.rgb2hsl({r: 17, g: 170, b: 221}), hsl);
    },

    "test hsl2rgb": function () {
      assert.equals(uColor.hsl2rgb({h: 0.5, s: 0.8, l: 0.5}), {r: 25, g: 229, b: 230});
      assert.equals(uColor.hsl2rgb({h: 1, s: 1, l: 0.25}), {r: 128, g: 0, b: 0});
    },

    "test setBackgroundAndBoarderColorStyle": function () {

      var style = {foo: 123};

      uColor.setBackgroundAndBoarderColorStyle(style, '#717a1d');

      assert.equals(style, {foo: 123, "background-color": "#717a1d", color: "#fcfcfc", "border-color": "rgba(252,252,252,0.3)"});
    },

    "test setBackgroundColorStyle": function () {

      var style = {foo: 123};

      uColor.setBackgroundColorStyle(style, '#717a1d');

      assert.equals(style, {foo: 123, "background-color": "#717a1d", color: "#fcfcfc"});
    },

    "test backgroundColorStyle": function () {
      assert.same(uColor.backgroundColorStyle('#11aadd'), "background-color:#11aadd;color:#040404");

      assert.same(uColor.backgroundColorStyle('#11aadd'), "background-color:#11aadd;color:#040404");

      assert.same(uColor.backgroundColorStyle('#717a1d'), "background-color:#717a1d;color:#fcfcfc");
    },

    "test colorOnLight": function () {
      assert.same(uColor.colorOnLight('#717a1d'), '#717a1d');

      assert.same(uColor.colorOnLight('#f17afd'), '#d660e2');
    },

    "test colorClass": function () {
      assert.same(uColor.colorClass('#717a1d'), 'dark');
      assert.same(uColor.colorClass('#111a1d'), 'very dark');

      assert.same(uColor.colorClass('#717a9d'), 'light');
      assert.same(uColor.colorClass('#11fafd'), 'very light');
    },

    "test contrastColor": function () {
      assert.same(uColor.contrastColor('#717a1d'), '#feffa0');
      assert.same(uColor.contrastColor('#111a1d'), '#cbd6db');

      assert.same(uColor.contrastColor('#717a9d'), '#000223');
      assert.same(uColor.contrastColor('#11fafd'), '#003f46');
    },

    "test fade": function () {
      assert.same(uColor.fade('#717a9d', 50), 'rgba(113,122,157,0.5)');
    },
  });
});

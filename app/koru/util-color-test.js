define((require, exports, module)=>{
  'use strict';
  const HtmlDoc         = require('koru/dom/html-doc');
  const TH              = require('koru/test-helper');

  const {stub, spy} = TH;

  const uColor = require('./util-color');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("hex2Style", ()=>{
      assert.equals(uColor.hex2Style(''), "");
      assert.equals(uColor.hex2Style('#x'), "rgba(0,0,0,0)");
      assert.equals(uColor.hex2Style('#FF001180'), "rgba(255,0,17,0.5)");
    });

    test("toRGB", ()=>{
      assert.equals(uColor.toRGB('rgba(100, 3, 45, .75)'), {r: 100, g: 3, b: 45, a: 0.75});
      assert.equals(uColor.toRGB('rgb(100,3, 45)'), {r: 100, g: 3, b: 45, a: 1});
      assert.equals(uColor.toRGB('#FF001180'), {r: 255, g: 0, b: 17, a: 0.5});
      assert.equals(uColor.toRGB('#FF0011'), {r: 255, g: 0, b: 17, a: 1});
      assert.equals(uColor.toRGB('#FF0011FF'), {r: 255, g: 0, b: 17, a: 1});
      assert.equals(uColor.toRGB('#123'), {r: 17, g: 34, b: 51, a: 1});
      assert.equals(uColor.toRGB('#abc8'), {r: 170, g: 187, b: 204, a: 0.5315});
      const rgb = {r: 255, g: 0, b: 17, a: 1};
      assert.same(uColor.toRGB(rgb), rgb);
      assert.equals(uColor.toRGB(rgb), {r: 255, g: 0, b: 17, a: 1});
      assert.same(uColor.toRGB('12'), null);
      assert.equals(uColor.hex2rgb(), {r: 0, g: 0, b: 0, a: 1});
      assert.equals(uColor.hex2rgb(null), {r: 0, g: 0, b: 0, a: 1});
      assert.same(uColor.hex2rgb('1234567890', 'validate'), null);
      assert.equals(uColor.hex2rgb('123456', 'validate'), {r: 18, g: 52, b: 86, a: 1});
    });

    test("toHex", ()=>{
      assert.equals(uColor.toHex('rgba(100, 3, 45)'), '#64032d');
    });

    test("toRgbStyle", ()=>{
      assert.equals(uColor.toRgbStyle('rgba(100, 3, 45, .75)'), 'rgba(100, 3, 45, 0.75)');
      assert.equals(uColor.toRgbStyle('rgba(100, 3, 45)'), 'rgb(100, 3, 45)');
    });

    test("hex2rgb", ()=>{
      assert.equals(uColor.hex2rgb('#11aadd'), {r: 17, g: 170, b: 221, a: 1});
      assert.equals(uColor.hex2rgb('11aadd'), {r: 17, g: 170, b: 221, a: 1});
      assert.equals(uColor.hex2rgb('#aa11dd10'), {r: 170, g: 17, b: 221, a: 0.0625});

      assert.equals(uColor.hex2rgb('foo'), {r: 0, g: 0, b: 0, a: 1});
    });

    test("alphaHexToFrac", ()=>{
      assert.same(uColor.alphaHexToFrac('80'), 0.5);

      assert.same(uColor.alphaHexToFrac('87'), 0.5276);
      assert.same(uColor.alphaHexToFrac('4c'), 0.2969);
      assert.same(uColor.alphaHexToFrac('fe'), 0.9961);
      assert.same(uColor.alphaHexToFrac('01'), 0.0039);
      assert.same(uColor.alphaHexToFrac('00'), 0);
      assert.same(uColor.alphaHexToFrac('ff'), 1);
    });

    test("alphaFracToHex", ()=>{
      assert.same(uColor.alphaFracToHex(0.5), '80');
      assert.same(uColor.alphaFracToHex(0.5276), '87');
      assert.same(uColor.alphaFracToHex(0.2963), '4c');
      assert.same(uColor.alphaFracToHex(0.9961), 'fe');
      assert.same(uColor.alphaFracToHex(0.0039), '01');
      assert.same(uColor.alphaFracToHex(0), '00');
      assert.same(uColor.alphaFracToHex(0.01), '03');
      assert.same(uColor.alphaFracToHex(1), 'ff');
    });

    test("rgb2hex", ()=>{
      assert.equals(uColor.rgb2hex({r: 17, g: 170, b: 221}), '#11aadd');
      assert.equals(uColor.rgb2hex({r: 17, g: 170, b: 221, a: .3}, ''), '11aadd4d');
      assert.equals(uColor.rgb2hex({r: 255, g: 0, b: 128, a: .01}, ''), 'ff008003');
    });

    test("rgb2hsl", ()=>{
      const hsl = uColor.rgb2hsl('#11aadd');
      assert.near(hsl.h, 0.542, 0.001);
      assert.near(hsl.s, 0.857, 0.001);
      assert.near(hsl.l, 0.467, 0.001);

      assert.equals(uColor.rgb2hsl({r: 17, g: 170, b: 221}), hsl);
    });

    test("hsl2rgb", ()=>{
      assert.equals(uColor.hsl2rgb({h: 0.5, s: 0.8, l: 0.5}), {r: 25, g: 229, b: 230});
      assert.equals(uColor.hsl2rgb({h: 1, s: 1, l: 0.25}), {r: 128, g: 0, b: 0});
    });

    test("setBackgroundAndBorderColorStyle", ()=>{
      const style = {setProperty: stub()};

      uColor.setBackgroundAndBorderColorStyle(style, '#717a1d');

      assert.calledWith(style.setProperty, 'background-color', "#717a1d");
      assert.calledWith(style.setProperty, 'color', "#fcfcfc");
      assert.calledWith(style.setProperty, 'border-color', "rgba(252,252,252,0.3)");

      style.setProperty.reset();
      uColor.setBackgroundAndBorderColorStyle(style, '#717a1d80');
      assert.calledWith(style.setProperty, 'background-color', "rgba(113,122,29,0.5)");
      assert.calledWith(style.setProperty, 'color', "#fcfcfc");
      assert.calledWith(style.setProperty, 'border-color', "rgba(252,252,252,0.3)");
    });

    test("setBackgroundColorStyle", ()=>{
      const style = {setProperty: stub()};

      uColor.setBackgroundColorStyle(style, '#717a1d');
      assert.calledTwice(style.setProperty);
      assert.calledWith(style.setProperty, 'background-color', "#717a1d");
      assert.calledWith(style.setProperty, 'color', "#fcfcfc");

      style.setProperty.reset();

      uColor.setBackgroundColorStyle(style, '');
      assert.calledTwice(style.setProperty);
      assert.calledWith(style.setProperty, 'background-color', "");
      assert.calledWith(style.setProperty, 'color', "#4d4d4d");
    });

    test("backgroundColorStyle", ()=>{
      assert.same(uColor.backgroundColorStyle('#11aadda0'),
                  "background-color:rgba(17,170,221,0.626);color:#040404;");

      assert.same(uColor.backgroundColorStyle('#11aadd'), "background-color:#11aadd;color:#040404;");

      assert.same(uColor.backgroundColorStyle('#717a1d'), "background-color:#717a1d;color:#fcfcfc;");
    });

    test("colorOnLight", ()=>{
      assert.same(uColor.colorOnLight('#717a1d'), '#717a1d');

      assert.same(uColor.colorOnLight('#f17afd'), '#d660e2');
    });

    test("colorClass", ()=>{
      assert.same(uColor.colorClass('#717a1d'), 'dark');
      assert.same(uColor.colorClass('#111a1d'), 'verydark');
      assert.same(uColor.colorClass('#3030ff'), 'verydark');
      assert.same(uColor.colorClass('#4040ff'), 'dark');

      assert.same(uColor.colorClass('#819a9d'), 'light');
      assert.same(uColor.colorClass('#11fafd'), 'verylight');
    });

    test("contrastColor", ()=>{
      assert.same(uColor.contrastColor('#717a1d'), '#feffa0');
      assert.same(uColor.contrastColor('#111a1d'), '#cbd6db');

      assert.same(uColor.contrastColor('#71aa9d'), '#001201');
      assert.same(uColor.contrastColor('#11fafd'), '#003f46');
    });

    test("fade", ()=>{
      assert.same(uColor.fade('#717a9d', 50), 'rgba(113,122,157,0.5)');
    });

    test("addColorClass", ()=>{
      const elm = document.createElement('div');

      uColor.addColorClass(elm, '#717a9d');
      assert.same(elm.className, 'dark');

      uColor.addColorClass(elm, '#111a1d');
      assert.same(elm.className, 'verydark');

      uColor.addColorClass(elm, '#f1fafd');
      assert.same(elm.className, 'verylight');

      uColor.addColorClass(elm, '#818afd');
      assert.same(elm.className, 'light');
    });
  });
});

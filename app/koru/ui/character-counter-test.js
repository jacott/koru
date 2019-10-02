isClient && define((require, exports, module)=>{
  'use strict';
  const Dom             = require('koru/dom');
  const PlainText       = require('koru/ui/plain-text');
  const TH              = require('koru/ui/test-helper');

  const {stub, spy, util, match: m, stubProperty, intercept} = TH;

  const CharacterCounter = require('./character-counter');

  const {MutationObserver} = window;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      Dom.removeChildren(document.body);
    });

    test("attach", ()=>{
      const editor = PlainText.Editor.$autoRender({content: "foo", options: {
        placeholder: "hello"}});
      document.body.appendChild(editor);

      let checkNow;
      intercept(window, 'MutationObserver', function (func) {
        checkNow = func;
        return new MutationObserver(func);
      });

      const cc = new CharacterCounter({maxlength: 10, warninglength: 6});
      cc.attach(editor);
      const counter = cc.element.firstChild;
      assert.equals(Dom.htmlToJson(cc.element), {class: 'ui-charCounter', div: {div: [
        {span: "3"}, {span: "10"},
      ]}});

      editor.textContent = 'over50';
      let muts = cc.mutationObserver.takeRecords();
      assert.same(muts.length, 1);
      checkNow(muts);

      assert.equals(Dom.htmlToJson(counter), {class: 'ui-warn', div: [
        {span: "6"}, {span: "10"},
      ]});

      editor.appendChild(Dom.h('hello'));
      muts = cc.mutationObserver.takeRecords();
      assert.same(muts.length, 1);
      checkNow(muts);

      assert.equals(Dom.htmlToJson(counter), {class: 'ui-warn ui-error', div: [
        {span: "11"}, {span: "10"},
      ]});

      editor.firstChild.textContent = '';

      cc.checkNow();
      assert.equals(Dom.htmlToJson(counter), {class: '', div: [
        {span: "5"}, {span: "10"},
      ]});

      editor.textContent = '123456789012345';
      checkNow(muts);
      assert.equals(Dom.htmlToJson(counter), {class: 'ui-warn ui-error', div: [
        {span: "15"}, {span: "10"},
      ]});

      editor.textContent = '1234567890';
      checkNow(muts);
      assert.equals(Dom.htmlToJson(counter), {class: 'ui-warn', div: [
        {span: "10"}, {span: "10"},
      ]});

      editor.textContent = '1';
      editor.appendChild(Dom.h({div: ['2', {b: {i: '34'}}, {br: ''}]}));

      muts = cc.mutationObserver.takeRecords();
      checkNow(muts);
      assert.equals(Dom.htmlToJson(counter), {class: '', div: [
        {span: "5"}, {span: "10"},
      ]});

      spy(cc.mutationObserver, 'disconnect');
      cc.attach(null);
      assert.called(cc.mutationObserver.disconnect);
      assert.same(cc.editor, null);
    });
  });
});

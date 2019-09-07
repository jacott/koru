define((require, exports, module)=>{
  'use strict';
  /**
   * {#./rich-Text} validators.
   *
   * Enable with {#koru/model/validation.register;(module, RichTextValidator)} which is
   * conventionally done in `app/models/model.js`
   **/
  const Dom             = require('koru/dom');
  const ValidatorHelper = require('koru/model/validators/validator-helper');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const RichText        = require('./rich-text');

  const {stub, spy, onEnd, intercept} = TH;

  const {error$} = require('koru/symbols');

  const RichTextValidator = require('koru/ui/rich-text-validator');

  class Book extends ValidatorHelper.ModelStub {
  }
  Book.registerValidator(RichTextValidator);

  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{
    group("richText", ()=>{
      /**
       * Validate field is rich text. Field error set to `'invalid_html'` if invalid.
       *
       * @param options use `'filter'` to remove any invalid markup.
       **/

      before(()=>{
        api.method();
      });

      test("valid RichText", ()=>{
        //[
        // Valid RichText
        Book.defineFields({
          content: {type: 'text', richText: true}
        });

        const book = Book.build({content: RichText.fromHtml(Dom.h([{b: "once"}, "\nupon"]))});

        assert(book.$isValid());
        assert.equals(book.content, ['once\nupon', [11, 0, 0, 4]]);

        book.content = ['invalid', [22, -1]];
        refute(book.$isValid());
        assert.equals(book[error$].content,[['invalid_html']]);
        //]
      });

      test("valid text", ()=>{
        //[
        // valid text (string; not array)
        Book.defineFields({
          content: {type: 'text', richText: true}
        });

        const book = Book.build({content: "just\ntext"});

        assert(book.$isValid());
        assert.equals(book.content, 'just\ntext');
        //]
      });

      test("no Markup", ()=>{
        //[
        // Valid RichText
        Book.defineFields({
          content: {type: 'text', richText: true}
        });

        const book = Book.build({content: [['one', 'two'], null]});

        assert(book.$isValid());
        assert.equals(book.content, 'one\ntwo'); // converts array to plain text
        //]
      });

      test("bad but no changes", ()=>{
        //[
        // only checks changes
         Book.defineFields({
          content: {type: 'text', richText: true}
        });

        const book = Book.build();
        book.attributes.content = [['one', 'two'], [-1, -1]];
        assert(book.$isValid());
        //]
      });

      test("invalid change", ()=>{
        //[
        // invalid markup
        Book.defineFields({
          content: {type: 'text', richText: true}
        });

        const book = Book.build({content: [11, 2]});

        refute(book.$isValid());
        assert.equals(book[error$].content,[['invalid_html']]);
        //]
      });

      test("filtering with markup", ()=>{
        //[
        // filter html to expected format
        Book.defineFields({
          content: {type: 'text', richText: 'filter'}
        });

        const book = Book.build({content: RichText.fromHtml(Dom.h({
          div: {ol: [{li: 'a'}, {li: 'b'}]}, style: "text-align:right;"}))});

        assert.equals(book.content, ['a\nb', [7, 0, 1, 1, 0, 1, 20, 0, 0, 20, 1, 0]]);

        assert(book.$isValid());

        assert.equals(book.content, ['a\nb', [1, 0, 1, 20, 0, 0, 7, 0, 0, 20, 1, 0, 7, 0, 0]]);
        assert.equals(Dom.htmlToJson(RichText.toHtml(book.content[0], book.content[1])), [{
          ol: [
            {li: {style: "text-align: right;", div: 'a'}},
            {li: {style: "text-align: right;", div: 'b'}}
          ]}]);
        //]
      });

      test("filtering without markup", ()=>{
        //[
        // filter no markup
        Book.defineFields({
          content: {type: 'text', richText: 'filter'}
        });

        const book = Book.build({content: ['bold', null]});

        assert(book.$isValid());
        assert.equals(book.content, 'bold');
        //]
      });
    });

    group("richTextMarkup", ()=>{
      /**
       * Validate field (suffixed with `'Markup'`) contains rich text markup. The corresponding
       * plain text should be in adjacent field named without suffix. An error is set for field
       * (with `'HTML'` suffix instead of `'Markup'` suffix) to `'invalid_html'` if invalid.
       *
       * @param options use `'filter'` to remove any invalid markup.
       **/

      before(()=>{
        api.method();
      });

      test("valid", ()=>{
        //[
        // Valid
        Book.defineFields({
          content: {type: 'text'},
          contentMarkup: {type: 'text', richTextMarkup: true},
        });

        const rt = RichText.fromHtml(Dom.h([{b: "once"}, "\nupon"]));

        const book = Book.build({content: rt[0], contentMarkup: rt[1]});

        assert(book.$isValid());
        assert.equals(book.content, 'once\nupon');
        assert.equals(book.contentMarkup, [11, 0, 0, 4]);

        book.contentMarkup = [22, -1];
        refute(book.$isValid());
        assert.equals(book[error$].contentHTML, [['invalid_html']]);
        //]
      });

      test("filtering", ()=>{
        //[
        // filter html to expected format
        Book.defineFields({
          content: {type: 'text'},
          contentMarkup: {type: 'text', richTextMarkup: 'filter'},
        });

        const rt = RichText.fromHtml(Dom.h({
          div: {ol: [{li: 'a'}, {li: 'b'}]}, style: "text-align:right;"}));

        const book = Book.build({content: rt[0], contentMarkup: rt[1]});

        assert(book.$isValid());

        assert.equals(book.content, 'a\nb');

        assert.equals(book.contentMarkup, [1, 0, 1, 20, 0, 0, 7, 0, 0, 20, 1, 0, 7, 0, 0]);
        assert.equals(Dom.htmlToJson(RichText.toHtml(book.content, book.contentMarkup)), [{
          ol: [
            {li: {style: "text-align: right;", div: 'a'}},
            {li: {style: "text-align: right;", div: 'b'}}
          ]}]);
        //]
      });

      test("bad but no changes", ()=>{
        //[
        // only checks changes
        Book.defineFields({
          content: {type: 'text'},
          contentMarkup: {type: 'text', richTextMarkup: true},
        });

        const book = Book.build();
        book.attributes.content = ['one', 'two'];
        book.attributes.contentMarkup = [-1, -1];
        assert(book.$isValid());
        //]
      });

      test("bad change", ()=>{
        //[
        // only checks changes
        Book.defineFields({
          content: {type: 'text'},
          contentMarkup: {type: 'text', richTextMarkup: true},
        });

        const book = Book.build({content: ['one', 'two'], contentMarkup: null});
        refute(book.$isValid());
        assert.equals(book[error$].contentHTML, [['invalid_html']]);

        book.content = 'one\ntwo';
        book.contentMarkup = book.attributes.contentMarkup;
        book.attributes.contentMarkup = [1, 0, 0, -3];

        refute(book.$isValid());
        assert.equals(book[error$].contentHTML, [['invalid_html']]);
        //]
      });
    });
  });
});

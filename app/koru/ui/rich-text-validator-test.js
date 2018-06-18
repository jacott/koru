define(function (require, exports, module) {
  const Dom      = require('koru/dom');
  const TH       = require('koru/test-helper');
  const RichText = require('./rich-text');

  const {error$} = require('koru/symbols');

  const sut = require('../model/validation');
  var test, v;

  sut.register(module, {required: require('./rich-text-validator')});

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      test.intercept(RichText, 'isValid', function (text, markup) {
        v.args = [text, markup];
        return v.rt && text === v.rt[0]  && markup === v.rt[1];
      });
    },

    tearDown() {
      v = null;
    },

    "richText": {
      "test valid markup"() {
        v.rt = RichText.fromHtml(Dom.h([{b: "one"}, "\ntwo"]));
        var doc = {changes: {foo: v.rt}, foo: v.rt};

        sut.validators('richText')(doc, 'foo');
        assert.same(doc[error$], undefined);
        assert.equals(v.args, v.rt);
        assert.equals(doc.foo, ['one\ntwo', [11, 0, 0, 3]]);
      },

      "test valid text"() {
        var doc = {changes: {foo: "just\ntext"}, foo: "just\ntext"};

        sut.validators('richText')(doc, 'foo');
        assert.same(doc[error$], undefined);
        assert.equals(v.args, undefined);
        assert.equals(doc.foo, 'just\ntext');
      },

      "test no Markup"() {
        var doc = {foo: v.rt = [['one', 'two'], null]};

        sut.validators('richText')(doc, 'foo');
        assert.same(doc[error$], undefined);
        assert.equals(doc.foo, 'one\ntwo');
      },

      "test bad but no changes"() {
        var doc = {foo: [123, [3]], changes: {other: true}};

        sut.validators('richText')(doc, 'foo');
        refute(doc[error$]);
        assert.same(v.args, undefined);
      },

      "test bad change"() {
        var doc = {foo: 123, changes: {foo:  [[3]]}};

        v.rt = [11, 2];

        sut.validators('richText')(doc, 'foo');
        assert.equals(doc[error$]['foo'],[['invalid_html']]);
      },


      "test filtering with markup"() {
        var foo = RichText.fromHtml(Dom.h({div: {ol: [{li: 'a'}, {li: 'b'}]}, $style: "text-align: right;"}));
        var doc = {foo: foo, changes: {foo:  foo}};

        sut.validators('richText')(doc, 'foo', 'filter');
        refute(doc[error$]);
        assert.equals(doc.changes.foo, ['a\nb', [1, 0, 1, 20, 0, 0, 7, 0, 0, 20, 1, 0, 7, 0, 0]]);
        assert.same(doc.foo, doc.changes.foo);
      },

      "test filtering without markup"() {
        var foo = ['bold', null];
        var doc = {foo: foo, changes: {foo:  foo}};

        sut.validators('richText')(doc, 'foo', 'filter');
        refute(doc[error$]);
        assert.equals(doc.foo, 'bold');
      },
    },

    "richTextMarkup": {
      "test valid"() {
        v.rt = [];
        var doc = {changes: {foo: v.rt[0] = "one\ntwo"}, foo: v.rt[0], fooMarkup:  v.rt[1] = [3, 0, 0, 3]};

        sut.validators('richTextMarkup')(doc, 'fooMarkup');
        assert.same(doc[error$], undefined);
        assert.equals(v.args, [v.rt[0], v.rt[1]]);
      },

      "test filtering"() {
        var markup = RichText.fromHtml(Dom.h({div: {ol: [{li: 'a'}, {li: 'b'}]}, $style: "text-align: right;"}))[1];
        var doc = {foo: 'a\nb', fooMarkup: markup, changes: {foo:  markup}};

        sut.validators('richTextMarkup')(doc, 'fooMarkup', 'filter');
        refute(doc[error$]);
        assert.equals(doc.foo, 'a\nb');
        assert.equals(doc.fooMarkup, [1, 0, 1, 20, 0, 0, 7, 0, 0, 20, 1, 0, 7, 0, 0]);
      },


      "test bad but no changes"() {
        var doc = {foo: 123, fooMarkup:  [[3]], changes: {other: true}};

        sut.validators('richTextMarkup')(doc, 'fooMarkup');
        refute(doc[error$]);
        assert.same(v.args, undefined);
      },

      "test bad change"() {
        var doc = {foo: 123, changes: {fooMarkup:  [[3]]}, fooMarkup: 1122};

        sut.validators('richTextMarkup')(doc, 'fooMarkup');
        assert.equals(doc[error$]['fooHTML'],[['invalid_html']]);
        assert.equals(v.args, [123, 1122]);
      },

      'test invalid code'() {
        var doc = {changes: {foo: "one\ntwo"}, foo: 1234, fooMarkup:  [-1, 0, 0, 3]};

        sut.validators('richTextMarkup')(doc, 'fooMarkup');
        assert(doc[error$]);
        assert.equals(doc[error$]['fooHTML'],[['invalid_html']]);
        assert.equals(v.args, [1234, [-1, 0, 0, 3]]);
      },
    }
  });
});

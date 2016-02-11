define(function (require, exports, module) {
  var test, v;
  var TH = require('koru/test');
  var sut = require('../model/validation');
  var RichText = require('./rich-text');
  var Dom = require('koru/dom');

  sut.register(module, {required: require('./rich-text-validator')});

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      test.intercept(RichText, 'isValid', function (text, markup) {
        v.args = [text, markup];
        return v.rt && text === v.rt[0]  && markup === v.rt[1];
      });
    },

    tearDown: function () {
      v = null;
    },

    "richText": {
      "test valid markup": function () {
        v.rt = RichText.fromHtml(Dom.h([{b: "one"}, "\ntwo"]));
        var doc = {changes: {foo: v.rt}, foo: v.rt};

        sut.validators('richText')(doc, 'foo');
        assert.isNull(doc._errors);
        assert.equals(v.args, v.rt);
        assert.equals(doc.foo, ['one\ntwo', [3, 0, 0, 3]]);

      },

      "test valid text": function () {
        var doc = {changes: {foo: "just\ntext"}, foo: "just\ntext"};

        sut.validators('richText')(doc, 'foo');
        assert.isNull(doc._errors);
        assert.equals(v.args, undefined);
      },

      "test bad but no changes": function () {
        var doc = {foo: [123, [3]], changes: {other: true}};

        sut.validators('richText')(doc, 'foo');
        refute(doc._errors);
        assert.same(v.args, undefined);
      },

      "test bad change": function () {
        var doc = {foo: 123, changes: {foo:  [[3]]}};

        v.rt = [11, 2];

        sut.validators('richText')(doc, 'foo');
        assert.equals(doc._errors['foo'],[['invalid_html']]);
      },
    },

    "richTextMarkup": {
      "test valid": function () {
        v.rt = [];
        var doc = {changes: {foo: v.rt[0] = "one\ntwo"}, foo: v.rt[0], fooMarkup:  v.rt[1] = [3, 0, 0, 3]};

        sut.validators('richTextMarkup')(doc, 'fooMarkup');
        assert.isNull(doc._errors);
        assert.equals(v.args, [v.rt[0], v.rt[1]]);
      },

      "test bad but no changes": function () {
        var doc = {foo: 123, fooMarkup:  [[3]], changes: {other: true}};

        sut.validators('richTextMarkup')(doc, 'fooMarkup');
        refute(doc._errors);
        assert.same(v.args, undefined);
      },

      "test bad change": function () {
        var doc = {foo: 123, changes: {fooMarkup:  [[3]]}, fooMarkup: 1122};

        sut.validators('richTextMarkup')(doc, 'fooMarkup');
        assert.equals(doc._errors['fooHTML'],[['invalid_html']]);
        assert.equals(v.args, [123, 1122]);
      },

      'test invalid code': function () {
        var doc = {changes: {foo: "one\ntwo"}, foo: 1234, fooMarkup:  [-1, 0, 0, 3]};

        sut.validators('richTextMarkup')(doc, 'fooMarkup');
        assert(doc._errors);
        assert.equals(doc._errors['fooHTML'],[['invalid_html']]);
        assert.equals(v.args, [1234, [-1, 0, 0, 3]]);
      },
    }
  });
});

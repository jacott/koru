define(function (require, exports, module) {
  var test, v;
  var TH = require('koru/test');
  var sut = require('../model/validation');
  var RichText = require('./rich-text');

  sut.register(module, {required: require('./rich-text-validator')});

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      test.intercept(RichText, 'isValid', function (text, markup) {
        v.args = [text, markup];
        return text === v.text && markup === v.markup;
      });
    },

    tearDown: function () {
      v = null;
    },

    "richTextMarkup": {
      "test valid": function () {
        var doc = {changes: {foo: v.text = "one\ntwo"}, foo: v.text, fooMarkup:  v.markup = [3, 0, 0, 3]};

        sut.validators('richTextMarkup')(doc, 'fooMarkup');
        assert.isNull(doc._errors);
        assert.equals(v.args, [v.text, v.markup]);
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

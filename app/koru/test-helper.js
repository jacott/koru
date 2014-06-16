define(function(require, exports, module) {
  var koru = require('./main');
  var TH = require('./test/main');

  var util = koru.util;
  var geddon = TH.geddon;
  var gu = geddon._u;

  TH = koru.util.reverseExtend({
    silenceLogger: function (func) {
      var logger = geddon.test.stub(koru, 'logger');
      if (func) {
        try {
          func();
        } finally {
          logger.restore();
        }
      } else {
        geddon.test.onEnd(function () {
          logger.restore();
        });
      }
    },

    util: koru.util,

    login: function (id, func) {
      var oldId = util.thread.userId;
      try {
        util.thread.userId = id;
        func();
      }
      finally {
        util.thread.userId = oldId;
      }
    },
  }, TH);

  var ga = geddon.assertions;

  ga.add('difference', {
    assert: function (count, diffFunc, /* [query], */ func) {
      if (diffFunc.modelName) {
        var query = util.slice(arguments, 2, -1)[0];
        func = arguments[arguments.length - 1];
        var model = diffFunc;
        diffFunc = function () {
          query = query || model.query;
          return query.count();
        };
      }
      this.before = +diffFunc();
      func();
      this.after = +diffFunc();
      return this.after - this.before === count;
    },

    message: "a difference of {0}. Before {$before}, after {$after}",
  });

  ga.add('accessDenied', {
    assert: function (func) {
      var error;
      try {
        func.call();
      } catch(e) {error = e;}
      if (error) {
        if (error.error === 403 && error.reason === "Access denied")
          return true;

        throw error;
      }
      return false;
    },

    assertMessage: "Expected AccessDenied",
    refuteMessage: "Did not expect AccessDenied",
  });

  ga.add('invalidRequest', {
    assert: function (func) {
      var error;
      try {
        func.call();
      } catch(e) {error = e;}
      if (error) {
        if (error.error === 400 && error.reason.match(/^Invalid request/))
          return true;

        throw error;
      }
      return false;
    },

    assertMessage: "Expected Invalid request",
    refuteMessage: "Did not expect Invalid request",
  });

  ga.add('modelErrors', {
    assert: function (doc, expected) {
      var result = {}, errors = doc._errors || {};

      for(var field in errors) {
        var msgs = errors[field].map(function (m) {
          return m.join(', ');
        });

        result[field] = msgs.join('; ');
      }

      this.result = result;
      return gu.deepEqual(result, expected);
    },

    message: "{i$result} to be {i1}",
  });

  ga.add('validators', {
    assert: function (validators, expected) {
      this.actual = validators;
      this.expected = expected;
      if (Object.keys(expected).length !== Object.keys(validators).length) {
        this.key = Object.keys(validators);
        return false;
      }
      for(var key in expected) {
        var val = validators[key];
        this.key = key;
        this.actual = val.slice(1,2);
        this.expected = expected[key];
        if (! (val && gu.deepEqual(val.slice(1,2), expected[key]))) return false;
      }
      return true;
    },

    assertMessage: "Expected {i$actual} to match {i$expected}. {i$key}",
    refuteMessage: "Did not expect {i0} to match {i1}"
  });


  ga.add('specificAttributesEqual', {
    assert: function (actual, expected) {
      if (! (actual && expected)) {
        this.actual = actual;
        this.expected = expected;
        return ! this._asserting;
      }
      if (actual && actual.attributes)
        actual = actual.attributes;

      this.actual = actual;
      this.expected = expected;

      for(var key in expected) {
        if (! gu.deepEqual(actual[key], expected[key])) {
          this.diff = key;
          return false;
        }
      }

      return true;
    },

    message: "attribute {i$diff} in {i$actual} to equal the specified attributes: {i$expected}",
  }),

  ga.add('attributesEqual', {
    assert: function (actual, expected, exclude) {
      if (! (actual && expected)) {
        this.actual = actual;
        this.expected = expected;
        return ! this._asserting;
      }
      if (! (actual instanceof Array)) actual = [actual];
      if (! (expected instanceof Array)) expected = [expected];
      if (actual[0] && actual[0].attributes) {
        actual = actual.map(function (i) {
          return i.attributes;
        });
      }
      if (expected[0] && expected[0].attributes) {
        expected = expected.map(function (i) {
          return i.attributes;
        });
      }
      actual = mapFields(actual, exclude);
      expected = mapFields(expected, exclude);
      this.actual = actual;
      this.expected = expected;

      return gu.deepEqual(actual, expected);
    },

    message: "attributes in {i$actual} to equal {i$expected}",
  });

  function mapFields(list, exclude) {
    var result = {};
    if (list.length === 0) return result;
    var useId = (! exclude || exclude.indexOf('_id') === -1) && !! list[0]._id;
    for(var i=0;i < list.length;++i) {
      var row = list[i];
      if (exclude) {
        var attrs = {};
        for(var key in row) {
          if (exclude.indexOf(key) === -1) {
            attrs[key] = row[key];
          }
        }
      } else {
        var attrs = row;
      }
      result[useId ? row._id : i] = attrs;
    }
    return result;
  }

  return TH;
});

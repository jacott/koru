define((require)=>{
  const koru            = require('koru');
  const Test            = require('koru/test');

  const {error$} = require('koru/symbols');

  const {util} = koru;
  const {Core} = Test;
  const {deepEqual} = Core;

  const TH = koru.util.reverseMerge({
    login (id, func) {
      const oldId = util.thread.userId;
      try {
        util.thread.userId = id;
        func();
      }
      finally {
        util.thread.userId = oldId;
      }
    },
    noInfo () {
      if (! koru.info.restore)
        Core.test.intercept(koru, 'info');
    },
  }, Test);

  const ga = Core.assertions;

  ga.add('difference', {
    assert(options, body) {
      const {by} = options;
      const counter = options.counter ||
              (options.model ? () => options.model.query.count() : () => options.query.count());
      this.before = +counter();
      body();
      this.after = +counter();
      return this.after - this.before === by;
    },

    message: "a difference of {0}. Before {$before}, after {$after}",
  });

  ga.add('accessDenied', {
    assert(func) {
      let error;
      try {
        func.call();
      } catch(e) {error = e;}
      if (error) {
        if (error.error === 403 && error.reason === "Access denied") {
          this.details = error.details;
          return true;
        }

        throw error;
      }
      return false;
    },

    assertMessage: "Expected AccessDenied",
    refuteMessage: "Did not expect AccessDenied: {$details}",
  });

  ga.add('invalidRequest', {
    assert(func) {
      let error;
      try {
        func.call();
      } catch(e) {error = e;}
      if (error) {
        if (error.error === 400)
          return true;

        throw error;
      }
      return false;
    },

    assertMessage: "Expected Invalid request",
    refuteMessage: "Did not expect Invalid request",
  });

  ga.add('modelErrors', {
    assert(doc, expected) {
      const result = {}, {[error$]: errors} = doc;

      for(const field in errors) {
        const msgs = errors[field].map(m =>{
          if (m.length === 1)
            return m[0];
          return m.map(n => typeof n === 'object' ? util.inspect(n) : n).join(', ');
        });

        result[field] = msgs.join('; ');
      }

      this.result = result;
      return deepEqual(result, expected);
    },

    message: "{i$result} to be {i1}",
  });

  ga.add('validators', {
    assert(validators, expected) {
      if (validators == null)
        Core.fail("Could not find field");
      this.actual = validators;
      this.expected = expected;
      if (Object.keys(expected).length !== Object.keys(validators).length) {
        this.key = Object.keys(validators);
        return false;
      }

      for(const key in expected) {
        const val = validators[key];
        this.key = key;
        this.actual = val && val.slice(1,2);
        this.expected = expected[key];

        if (! (val && deepEqual(val.slice(1,2), expected[key]))) return false;
      }
      return true;
    },

    assertMessage: "Expected {i$actual} to match {i$expected}. For {i$key}",
    refuteMessage: "Did not expect {i0} to match {i1}"
  });


  ga.add('attributesEqual', {
    assert(actual, expected, exclude) {
      if (! (actual && expected)) {
        this.actual = actual;
        this.expected = expected;
        return ! this._asserting;
      }
      if (! Array.isArray(actual)) actual = [actual];
      if (! Array.isArray(expected)) expected = [expected];
      if (actual[0] && actual[0].attributes) {
        actual = actual.map(i => i.attributes);
      }
      if (expected[0] && expected[0].attributes) {
        expected = expected.map(i => i.attributes);
      }
      actual = mapFields(actual, exclude);
      expected = mapFields(expected, exclude);
      this.actual = actual;
      this.expected = expected;

      return deepEqual(actual, expected, this, 'diff');
    },

    message: "attributes to be equal{$diff}",
  });

  const mapFields = (list, exclude)=>{
    const result = {};
    if (list.length === 0) return result;
    const useId = (! exclude || exclude.indexOf('_id') === -1) && !! list[0]._id;
    for (let i = 0; i < list.length; ++i) {
      const row = list[i];
      let attrs;
      if (exclude) {
        attrs = {};
        for (const key in row) {
          if (exclude.indexOf(key) === -1) {
            attrs[key] = row[key];
          }
        }
      } else {
        attrs = row;
      }
      result[useId ? row._id : i] = attrs;
    }
    return result;
  };

  return TH;
});

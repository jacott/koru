define((require) => {
  'use strict';
  const koru            = require('koru');
  const Test            = require('koru/test');

  const {error$} = require('koru/symbols');

  const {util} = koru;
  const {Core} = Test;
  const {deepEqual} = Core;

  const TH = koru.util.reverseMerge({
    login: (id, func) => {
      if (typeof id === 'object' && id !== null) {
        id = id._id;
      }
      if (func === void 0) {
        TH.stubProperty(util.thread, 'userId', {value: id});
        return;
      }
      const oldId = util.thread.userId;
      try {
        util.thread.userId = id || void 0;
        func();
      } finally {
        util.thread.userId = oldId;
      }
    },

    noInfo: () => {
      if (koru.info.restore === void 0) {
        Core.test.intercept(koru, 'info');
      }
    },

    createPromiseCallback: () => {
      let resolve, reject;
      return {
        promise: new Promise((suc, err) => {resolve = suc, reject = err}),
        callback: TH.stub((err) => {err ? reject(err) : resolve()}),
      };
    },

    promiseStub: () => {
      const p = {};
      p.then = Core.test.stub().returns(p);
      p.catch = Core.test.stub().returns(p);
      p.finally = Core.test.stub().returns(p);
      return p;
    },

    async awaitLoop(n) {
      for (let i = 0; i < n; ++i) await null;
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

    message: 'a difference of {0}. Before {$before}, after {$after}',
  });

  const accessDeniedAsync = async (p) => {
    let error;
    try {
      await p;
    } catch (e) {error = e}

    if (error) {
      if (error.error === 403) {
        return true;
      }

      throw error;
    }
    return false;
  };

  ga.add('accessDenied', {
    assert(func) {
      let error;
      try {
        const p = func.call();
        if (isPromise(p)) return accessDeniedAsync(p);
      } catch (e) {error = e}
      if (error) {
        if (error.error === 403) {
          return true;
        }

        throw error;
      }
      return false;
    },

    assertMessage: 'Expected AccessDenied',
    refuteMessage: 'Did not expect AccessDenied: {$details}',
  });

  const invalidRequestError = (error) => {
    if (error.error === 400) return true;
    throw error;
  };

  ga.add('invalidRequest', {
    assert(func) {
      let error;
      try {
        const p = func();
        if (isPromise(p)) {
          return p.then(false, invalidRequestError);
        }
      } catch (error) {
        return invalidRequestError(error);
      }
      return false;
    },

    assertMessage: 'Expected Invalid request',
    refuteMessage: 'Did not expect Invalid request',
  });

  ga.add('modelErrors', {
    assert(doc, expected) {
      const result = {}, {[error$]: errors} = doc;

      for (const field in errors) {
        const msgs = errors[field].map((m) => {
          if (m.length === 1) {
            return m[0];
          }
          return m.map((n) => typeof n === 'object' ? util.inspect(n) : n).join(', ');
        });

        result[field] = msgs.join('; ');
      }

      this.result = result;
      return deepEqual(result, expected);
    },

    message: '{i$result} to be {i1}',
  });

  ga.add('validators', {
    assert(validators, expected) {
      if (validators == null) {
        assert.fail('Could not find field', 1);
      }
      this.actual = validators;
      this.expected = expected;
      if (Object.keys(expected).length !== Object.keys(validators).length) {
        this.key = Object.keys(validators);
        return false;
      }

      for (const key in expected) {
        const val = validators[key];
        this.key = key;
        this.actual = val && val.slice(1, 2);
        this.expected = expected[key];

        if (! (val && deepEqual(val.slice(1, 2), expected[key]))) return false;
      }
      return true;
    },

    assertMessage: 'Expected {i$actual} to match {i$expected}. For {i$key}',
    refuteMessage: 'Did not expect {i0} to match {i1}',
  });

  ga.add('defineFields', {
    assert(model, expected) {
      for (const field in expected) {
        const validators = model.$fields[field];
        if (validators == null) {
          assert.fail('Could not find field ' + field, 1);
        }
        this.field = field;

        if (deepEqual(this.actual = validators,
                      this.expected = expected[field], this, 'diff') !== this._asserting) {
          return ! this._asserting;
        }
      }
      return true;
    },

    assertMessage: 'Expected {$field} to match{$diff}',
    refuteMessage: 'Did not expect {i1} to match {i2}',
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
        actual = actual.map((i) => i.attributes);
      }
      if (expected[0] && expected[0].attributes) {
        expected = expected.map((i) => i.attributes);
      }
      actual = mapFields(actual, exclude);
      expected = mapFields(expected, exclude);
      this.actual = actual;
      this.expected = expected;

      return deepEqual(actual, expected, this, 'diff');
    },

    message: 'attributes to be equal{$diff}',
  });

  const mapFields = (list, exclude) => {
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

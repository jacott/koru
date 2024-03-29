define((require) => {
  'use strict';
  const format          = require('../format');
  const koru            = require('../main');
  const match           = require('../match');
  const ResourceString  = require('../resource-string');
  const util            = require('../util');

  const {error$, inspect$} = require('koru/symbols');

  const {hasOwn} = util;

  const validators = {};

  const ID_SPEC = {_id: 'id'};

  const awaitCheckPromises = async (promises) => {
    let r;
    for (const p of promises) {
      try {
        if (! await p && r === undefined) r = null;
      } catch (e) {
        r ??= e === false ? null : e;
      }
    }
    if (r == null) return r === undefined;
    throw r;
  };

  const Val = {
    error$,
    Error: {
      msgFor(doc, field, other_error) {
        const errors = field !== undefined
              ? (doc[error$] ?? doc)[field]
              : (Array.isArray(doc) ? doc : [[doc.toString()]]);
        if (errors !== undefined) {
          return errors.map(format.translate).join(', ');
        } else if (other_error !== undefined) {
          return ResourceString.en[other_error];
        } else {
          return null;
        }
      },

      toString(doc) {
        const errors = doc[error$] ?? doc;
        return Object.keys(errors)
          .map((field) => `${field}: ${this.msgFor(errors[field])}`)
          .join('; ');
      },
    },

    /** @deprecated */
    text(msg) {
      return format.translate(msg);
    },

    check(obj, spec, options={}) {
      let promises;
      const {onError, altSpec, baseName: name, filter} = options;
      const check1 = (obj, subSpec, name) => {
        if (typeof subSpec === 'string') {
          if (obj != null && ! match[subSpec]?.test(obj)) {
            bad(name, obj, subSpec);
          }
        } else if (Array.isArray(subSpec)) {
          if (! Array.isArray(obj)) bad(name, obj, subSpec);
          subSpec = subSpec[0];
          util.forEach(obj, (item, index) => {
            check1(item, subSpec, name ? name + '.' + index : index);
          });
        } else if (match.baseObject.test(subSpec)) {
          for (const key in obj) {
            try {
              if (hasOwn(subSpec, key)) {
                check1(obj[key], subSpec[key], name ? name + '.' + key : key);
              } else if (subSpec === spec && altSpec && hasOwn(altSpec, key)) {
                check1(obj[key], altSpec[key], name ? name + '.' + key : key);
              } else {
                bad(name ? name + '.' + key : key, obj, subSpec, key);
              }
            } catch (ex) {
              if (filter && ex === false) {
                filter(obj, key, subSpec, name);
              } else {
                throw ex;
              }
            }
          }
        } else if (! (match.isMatch(subSpec))) {
          bad(name, obj, subSpec);
        } else {
          const p = subSpec.test(obj);
          if (isPromise(p)) {
            (promises ??= []).push(p.then((r) => (r || onError?.(name, obj, subSpec))));
          } else if (! p) {
            bad(name, obj, subSpec);
          }
        }
      };

      const bad = (...args) => {
        if (typeof onError === 'function' && onError(...args)) {
          return;
        }
        throw false;
      };

      let r;

      try {
        check1(obj, spec, name);
      } catch (err) {
        r = err === false ? null : err;
      }

      if (promises !== undefined) {
        return awaitCheckPromises(promises);
      }

      if (r == null) return r === undefined;
      throw r;
    },

    nestedFieldValidator: (func) => function (field) {
      const doc = this;
      const value = doc.changes[field];
      if (value !== undefined) {
        func(doc, field, value, {
          onError(name, obj) {
            if (name) {
              Val.addError(doc, field, 'is_invalid', name, typeof obj === 'string' ? obj : obj?.[error$]);
            } else {
              Val.addError(doc, field, 'is_invalid');
            }
          },
        });
      }
    },

    assertCheck(obj, spec, options) {
      let error, reason;
      if (! this.check(
        obj, spec, options?.onError === undefined
          ? {
            __proto__: options,
            onError(name, obj) {
              if (obj?.[error$] !== undefined) {
                reason = obj[error$];
              } else if (name) {
                reason = {}; reason[name] = [['is_invalid']];
              } else {
                reason = 'is_invalid';
              }
              if (error === undefined) {
                error = new koru.Error(400, reason);
              }
            },
          }
        : options)) {
        throw error;
      }
    },

    assertDocChanges(doc, spec, new_spec=ID_SPEC) {
      if (doc.$isNewRecord()) {
        this.allowAccessIf(new_spec !== null);
        this.assertCheck(doc.changes, spec, {altSpec: new_spec});
      } else {
        this.assertCheck(doc.changes, spec);
      }
    },

    matchFields(fieldSpec, name) {
      const m = match((doc) => {
        if (doc === null || typeof doc !== 'object') return false;
        if (doc[error$] !== undefined) doc[error$] = undefined;
        for (const field in doc) {
          if (! hasOwn(fieldSpec, field)) {
            Val.addError(doc, field, 'unexpected_field');
            return false;
          }
        }

        for (const field in fieldSpec) {
          Val.validateField(doc, field, fieldSpec[field]);
        }

        return doc[error$] === undefined;
      }, name ?? {toString() {return 'match.fields(' + util.inspect(fieldSpec) + ')'}});
      m.$spec = fieldSpec;
      return m;
    },

    matchFieldsAsync(fieldSpec, name) {
      const m = match(async (doc) => {
        if (doc === null || typeof doc !== 'object') return false;
        if (doc[error$] !== undefined) doc[error$] = undefined;
        for (const field in doc) {
          if (! hasOwn(fieldSpec, field)) {
            Val.addError(doc, field, 'unexpected_field');
            return false;
          }
        }

        for (const field in fieldSpec) {
          await Val.validateFieldAsync(doc, field, fieldSpec[field]);
        }

        return doc[error$] === undefined;
      }, name ?? {toString() {return 'match.fields(' + util.inspect(fieldSpec) + ')'}});
      m.$spec = fieldSpec;
      return m;
    },

    typeSpec(model, name) {
      const ans = {};
      const fields = model.$fields;
      for (const id in fields) {
        const field = fields[id];
        if (! field.readOnly) {
          ans[id] = field.type;
        }
      }
      return ans;
    },

    validateField(doc, field, spec) {
      for (const name in spec) {
        validators[name]?.call(this, doc, field, spec[name], spec);
      }

      if (doc[error$] !== undefined) return false;

      const value = doc[field];
      if (value != null && ! Val.check(value, spec.type)) {
        Val.addError(doc, field, 'wrong_type', spec.type);
        return;
      }

      return doc[error$] === undefined;
    },

    async validateFieldAsync(doc, field, spec) {
      for (const name in spec) {
        await validators[name]?.call(this, doc, field, spec[name], spec);
      }

      if (doc[error$] !== undefined) return false;

      const value = doc[field];
      if (value != null && ! await Val.check(value, spec.type)) {
        Val.addError(doc, field, 'wrong_type', spec.type);
        return;
      }

      return doc[error$] === undefined;
    },

    denyAccessIf(falsey, message) {
      this.allowAccessIf(! falsey, message);
    },

    /** Simple is not objects {} or functions */
    allowIfSimple(...args) {
      for (let i = 0; i < args.length; ++i) {
        switch (typeof args[i]) {
        case 'object':
          if (args[i] == null) break;
          const proto = Object.getPrototypeOf(args[i]);
          if (proto === Array.prototype) {
            Val.allowIfSimple.apply(Val, args[i]);
            break;
          } else if (proto === Date.prototype) break
          accessDenied('argument is an object ');
        case 'function':
          accessDenied('argument is a function');
        }
      }
      return true;
    },

    allowAccessIf(truthy, message) {
      return truthy || accessDenied(message);
    },

    ensureString(...args) {ensure(match.string, args)},
    ensureNumber(...args) {ensure(match.number, args)},
    ensureDate(...args) {ensure(match.date, args)},
    ensure(type, ...args) {ensure(type, args)},

    errorsToString(doc) {
      const errs = doc[error$];

      if (errs === undefined) return;

      const result = [];
      for (const field in errs) {
        const msgs = errs[field].map((m) => util.inspect(m));

        result.push(field + ': ' + msgs.join('; '));
      }
      return result.join(', ');
    },

    inspectErrors(doc) {
      const errs = this.errorsToString(doc);

      return doc.constructor.modelName + (errs ? ': Errors: ' + errs : ': No errors');
    },

    allowIfValid(truthy, doc) {
      if (! truthy) {
        let reason;
        if (doc != null) {
          if (doc[error$] !== undefined) {
            reason = doc[error$];
          } else {
            if (typeof doc === 'object') {
              reason = doc;
            } else {
              reason = {[doc]: [['is_invalid']]};
            }
          }
        } else {
          reason = 'is_invalid';
        }
        throw new koru.Error(400, reason);
      }
      return truthy;
    },

    allowIfFound(truthy, field) {
      if (! truthy) {
        throw new koru.Error(404, field ? {[field]: [['not_found']]} : 'Not found');
      }
    },

    validateName(name, length) {
      if (typeof name !== 'string') {
        return ['is_required'];
      }

      name = name.trim();

      if (name.length === 0) {
        return ['is_required'];
      }

      if (name.length > length) {
        return ['cant_be_greater_than', length];
      }

      return name;
    },

    validators(validator) {
      return validators[validator];
    },

    register(module, map) {
      const registered = [];
      for (const regName in map) {
        const item = map[regName];
        if (typeof item === 'function') {
          validators[regName] = item;
          registered.push(regName);
        } else {
          for (const regName in item) {
            validators[regName] = item[regName];
            registered.push(regName);
          }
        }
      }

      module.onUnload(() => {
        registered.forEach((key) => {delete validators[key]});
      });
    },

    deregister: (key) => {delete validators[key]},

    addError: (doc, field, ...args) => {
      const errors = doc[error$] === undefined ? (doc[error$] = {}) : doc[error$],
            fieldErrors = errors[field] ??= [];

      fieldErrors.push(args);
    },

    addErrorIfNone: (doc, field, ...args) => {
      const errors = doc[error$] === undefined ? (doc[error$] = {}) : doc[error$];
      if (errors[field] === undefined) {
        errors[field] = [args];
      }
    },

    transferErrors: (field, from, to) => {
      const errors = from[error$]?.[field];
      if (errors === undefined) return;

      for (const err of errors) {
        Val.addError(to, field, ...err);
      }
    },

    addSubErrors(doc, field, subErrors) {
      const errors = doc[error$] ??= {};
      for (const name in subErrors) {
        const fullname = `${field}.${name}`;
        const fieldErrors = errors[fullname];
        if (fieldErrors === undefined) {
          errors[fullname] = subErrors[name].slice();
        } else {
          subErrors[name].forEach((r) => {fieldErrors.push(r)});
        }
      }
    },

    clearErrors(doc) {
      if (doc !== null && typeof doc === 'object' && doc[error$] !== undefined) {
        doc[error$] = undefined;
      }
    },
  };

  const accessDenied = (details, nolog) => {
    const reason = 'Access denied';
    const error = new koru.Error(403, details === undefined ? reason : reason + ' - ' +
                                 (details?.[inspect$]?.() ?? (details?.toString?.())));

    if (! nolog && ! util.thread.suppressAccessDenied) {
      koru.info(`Access denied: user ${koru.userId()}: ${details}`,
                koru.util.extractError(error));
    }
    throw error;
  };

  const convertPermitSpec = (input) => {
    const output = {};

    for (let i = 0, item; item = input[i]; ++i) {
      switch (typeof item) {
      case 'string':
        output[item] = true;
        break;
      case 'object':
        if (Array.isArray(item)) {
          for (let j = 0; j < item.length; ++j) {
            const obj = item[j];
            for (const key in obj) {
              output[key] = [convertPermitSpec(obj[key])];
            }
          }
        } else {
          for (const key in item) {
            const list = item[key];
            if (Array.isArray(list)) {
              output[key] = convertPermitSpec(list);
            } else {
              output[key] = list;
            }
          }
        }
        break;
      }
    }

    return output;
  };

  const ensure = (type, args) => {
    if (typeof type === 'string') {
      type = match[type];
    }
    for (let i = 0; i < args.length; ++i) {
      type.test(args[i]) || accessDenied(`expected ${type}`);
    }
  };

  return Val;
});

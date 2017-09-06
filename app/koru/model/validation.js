define(function(require, exports, module) {
  const format         = require('../format');
  const koru           = require('../main');
  const match          = require('../match');
  const ResourceString = require('../resource-string');
  const util           = require('../util');

  const {hasOwnProperty} = Object.prototype;

  const validators = {};

  const ID_SPEC = {_id: 'id'};

  const Val = module.exports = {
    Error: {
      msgFor(doc, field, other_error) {
        const errors = doc._errors !== undefined ? doc._errors[field]
                : typeof doc === 'string' ? [[doc]] : doc;
        if (errors !== undefined) {
          return errors.map(Val.text).join(", ");
        } else if (other_error) {
          console.log('ERROR: ', JSON.stringify(doc._errors));
          return ResourceString.en[other_error];
        } else
          return null;
      },

      toString(doc) {
        const errors = doc._errors || doc;
        return Object.keys(errors)
          .map(field => `${field}: ${this.msgFor(errors[field])}`)
          .join("; ");
      },
    },

    text(msg) {
      if (Array.isArray(msg))
        return format(ResourceString.en[msg[0]] || msg[0], msg.slice(1));
      return ResourceString.en[msg] || msg;
    },

    check(obj, spec, options) {
      const {onError: error, altSpec, baseName: name, filter} = options || {};
      try {
        check1(obj, spec, name);
        return true;
      } catch(ex) {
        if (ex === false) {
          return false;
        }
        throw ex;
      }
      function check1(obj, subSpec, name) {
        if (typeof subSpec === 'string') {
          if (obj == null) return;
          if (match[subSpec] && match[subSpec].$test(obj))
            return;
          bad(name, obj, subSpec);


        } else if (Array.isArray(subSpec)) {
          if (! Array.isArray(obj)) bad(name, obj, subSpec);
          subSpec = subSpec[0];
          util.forEach(obj, function (item, index) {
            check1(item, subSpec, name ? name + '.' + index : index);
          });
        } else if (match.baseObject.$test(subSpec)) {
          for(const key in obj) {
            try {
              if (hasOwnProperty.call(subSpec, key)) {
                check1(obj[key], subSpec[key], name ? name+'.'+key : key);
              } else if (subSpec === spec && altSpec && hasOwnProperty.call(altSpec, key)) {
                check1(obj[key], altSpec[key], name ? name+'.'+key : key);
              } else {
                bad(name ? name+'.'+key : key, obj, subSpec, key);
              }
            } catch(ex) {
              if (filter && ex === false) {
                filter(obj, key, subSpec, name);
              } else
                throw ex;
            }
          }
        } else if (! (match.match.$test(subSpec) && subSpec.$test(obj))) {
          bad(name, obj, subSpec);
        }
      }

      function bad(...args) {
        if (error && error.apply(this, args))
          return;
        throw false;
      }
    },

    nestedFieldValidator(func) {
      return function (field) {
        const doc = this;
        const value = doc.changes[field];
        if (value !== undefined) {
          func(doc, field, value, {
            onError(name, obj) {
              if (name)
                Val.addError(doc, field, 'is_invalid',
                             name, typeof obj === 'string' ? obj : obj && obj._errors);
              else
                Val.addError(doc, field, 'is_invalid');

            },
          });
        }
      };
    },

    assertCheck(obj, spec, options) {
      let error, reason;
      if (options == null || ! hasOwnProperty.call(options, 'onError'))
        options = Object.assign({onError(name, obj) {
          if (obj && obj._errors !== undefined) {
            reason = obj._errors;
          } else if (name) {
            reason = {}; reason[name] = [['is_invalid']];
          } else {
            reason = 'is_invalid';
          }
          error = new koru.Error(400, reason);
        }}, options);
      if ( !this.check.call(this, obj, spec, options))
        throw error;
    },

    assertDocChanges(doc, spec, new_spec) {
      if (doc.$isNewRecord())
        this.assertCheck(doc.changes, spec, {altSpec : new_spec || ID_SPEC});
      else
        this.assertCheck(doc.changes, spec);
    },

    matchFields(fieldSpec, name) {
      const m = match(doc=>{
        if (! doc) return false;
        if (doc._errors !== undefined) doc._errors = undefined;
        for (const field in doc) {
          if (field === '_errors') continue;
          if (! hasOwnProperty.call(fieldSpec, field)) {
            Val.addError(doc, field, 'unexpected_field');
            return false;
          }
        }

        for (const field in fieldSpec)
          Val.validateField(doc, field, fieldSpec[field]);

        return doc._errors === undefined;
      }, name || {toString() {return 'match.fields(' + util.inspect(fieldSpec) + ')'}});
      m.$spec = fieldSpec;
      return m;
    },

    validateField(doc, field, spec) {
      for(const name in spec) {
        const validator = validators[name];
        validator && validator(doc, field, spec[name]);
      }

      if (doc._errors !== undefined) return false;

      const value = doc[field];
      if (value != null && ! Val.check(value, spec.type)) {
        Val.addError(doc, field, 'wrong_type', spec.type);
        return;
      }

      return doc._errors === undefined;
    },

    denyAccessIf(falsey, message) {
      this.allowAccessIf(! falsey, message);
    },

    /** Simple is not objects {} or functions */
    allowIfSimple(...args) {
      for(let i=0;i < args.length;++i) {
        switch (typeof args[i]) {
        case 'object':
          if (args[i] == null) break;
          const proto = Object.getPrototypeOf(args[i]);
          if (proto === Array.prototype) {
            Val.allowIfSimple.apply(Val, args[i]);
            break;
          } else if (proto === Date.prototype) break;
          accessDenied("argument is an object ");
        case 'function':
          accessDenied("argument is a function");
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
      const errs = doc._errors;

      if (errs === undefined) return;

      const result = [];
      for(const field in errs) {
        const msgs = errs[field].map(m => util.inspect(m));

        result.push(field + ': ' + msgs.join('; '));
      }
      return result.join(', ');
    },

    inspectErrors(doc) {
      const errs = this.errorsToString(doc);

      return doc.constructor.modelName + (errs ? ": Errors: " + errs : ": No errors");
    },

    allowIfValid(truthy, doc) {
      if (! truthy) {
        let reason;
        if (doc) {
          if (doc._errors !== undefined)
            reason = doc._errors;
          else {
            reason = {}; reason[doc] = [['is_invalid']];
          }
        } else {
          reason = 'is_invalid';
        }
        throw new koru.Error(400, reason);
      }
      return truthy;
    },

    allowIfFound(truthy, field) {
      if (! truthy)
        throw new koru.Error(404, field ? {[field]: [['not_found']]} : 'Not found');
    },

    validateName(name, length) {
      if (typeof name !== 'string')
        return ['is_required'];

      name = name.trim();

      if (name.length === 0)
        return ['is_required'];

      if (name.length > length)
        return ['cant_be_greater_than', length];

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
          validators[regName] = item.bind(this);
          registered.push(regName);
        } else {
          for(const regName in item) {
            validators[regName] = item[regName].bind(this);
            registered.push(regName);
          }
        }
      }

      koru.onunload(module, function () {
        registered.forEach(function (key) {
          delete validators[key];
        });
      });
    },

    deregister(key) {
      delete validators[key];
    },

    addError(doc,field, ...args) {
      const errors = doc._errors === undefined ? (doc._errors = {}) : doc._errors,
            fieldErrors = errors[field] || (errors[field] = []);

      fieldErrors.push(args);
    },
  };

  function accessDenied(details, nolog) {
    const error = new koru.Error(403, "Access denied", details);

    if (! nolog && ! util.thread.suppressAccessDenied)
      koru.info(`Access denied: user ${koru.userId()}: ${details}`,
                koru.util.extractError(error));
    throw error;
  }

  function convertPermitSpec(input) {
    const output = {};

    for(let i=0,item;item=input[i];++i) {
      switch (typeof item) {
      case 'string':
        output[item] = true;
        break;
      case 'object':
        if (Array.isArray(item)) {
          for(let j=0;j < item.length;++j) {
            const obj = item[j];
            for(const key in obj) {
              output[key] = [convertPermitSpec(obj[key])];
            }
          }
        } else {
          for(const key in item) {
            const list = item[key];
            if (Array.isArray(list))
              output[key] = convertPermitSpec(list);
            else
              output[key] = list;
          }
        }
        break;
      }
    }

    return output;
  }

  function ensure(type, args) {
    if (typeof type === 'string')
      type = match[type];
    for(let i = 0; i < args.length; ++i) {
      type.$test(args[i])  || accessDenied(`expected ${type}`);
    }
  }
});

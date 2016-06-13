define(function(require, exports, module) {
  const format          = require('../format');
  const koru            = require('../main');
  const match           = require('../match');
  const ResourceString  = require('../resource-string');
  const util            = require('../util');

  const validators = {};

  const ID_SPEC = {_id: 'id'};

  const Val = {
    Error: {
      msgFor: function (doc, field, other_error) {
        var errors = doc._errors ? doc._errors[field] : typeof doc === 'string' ? [[doc]] : doc;
        if (errors) {
          return errors.map(function (error) {
            return format(ResourceString.en[error[0]] || error[0], error.slice(1));
          }).join(", ");
        } else if (other_error) {
          console.log('ERROR: ', JSON.stringify(doc._errors));
          return ResourceString.en[other_error];
        } else
          return null;
      },

    },

    check: function (obj, spec, options) {
      if (arguments.length === 3 && options) {
        var error = options.onError;
        var altSpec = options.altSpec;
        var name = options.baseName;
        var filter = options.filter;
      }
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
          for(var key in obj) {
            try {
              if (subSpec.hasOwnProperty(key)) {
                var type = subSpec[key];
                check1(obj[key], subSpec[key], name ? name+'.'+key : key);
              } else if (subSpec === spec && altSpec && altSpec.hasOwnProperty(key)) {
                var type = altSpec[key];
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

      function bad() {
        if (error && error.apply(this, arguments))
          return;
        throw false;
      }
    },

    nestedFieldValidator: function (func) {
      return function (field) {
        var doc = this;
        var value = doc.changes[field];
        if (value !== undefined) {
          var opts = {
            onError: function (name, obj) {
              if (name)
                Val.addError(doc, field, 'is_invalid',
                             name, typeof obj === 'string' ? obj : obj && obj._errors);
              else
                Val.addError(doc, field, 'is_invalid');

            },
          };
          func(doc, field, value, opts);
        }
      };
    },

    assertCheck: function (obj, spec, options) {
      var error;
      if (! options || ! options.hasOwnProperty('onError'))
        options = util.extend({onError: function (name, obj) {
          if (obj && obj._errors) {
            var reason = obj._errors;
          } else if (name) {
            var reason = {}; reason[name] = [['is_invalid']];
          } else {
            var reason = 'is_invalid';
          }
          error = new koru.Error(400, reason);
        }}, options);
      if ( !this.check.call(this, obj, spec, options))
        throw error;
    },

    assertDocChanges: function (doc, spec, new_spec) {
      if (doc.$isNewRecord())
        this.assertCheck(doc.changes, spec, {altSpec : new_spec || ID_SPEC});
      else
        this.assertCheck(doc.changes, spec);
    },

    matchFields: function (fieldSpec, name) {
      var m = match(function (doc) {
        if (! doc) return false;
        doc._errors = undefined;
        for (var field in doc) {
          if (field === '_errors') continue;
          if (! fieldSpec.hasOwnProperty(field)) {
            Val.addError(doc, field, 'unexpected_field');
            return false;
          }
        }

        for (var field in fieldSpec)
          Val.validateField(doc, field, fieldSpec[field]);

        return ! doc._errors;
      }, name || {toString: function () {return 'match.fields(' + util.inspect(fieldSpec) + ')'}});
      m.$spec = fieldSpec;
      return m;
    },

    validateField: function (doc, field, spec) {
      for(var name in spec) {
        var validator = validators[name];
        validator && validator(doc, field, spec[name]);
      }

      if (doc._errors) return false;

      var value = doc[field];
      if (value != null && ! Val.check(value, spec.type)) {
        Val.addError(doc, field, 'wrong_type', spec.type);
        return;
      }

      return ! doc._errors;
    },

    denyAccessIf: function (falsey, message) {
      this.allowAccessIf(! falsey, message);
    },

    /** Simple is not objects {} or functions */
    allowIfSimple: function (/* arguments */) {
      for(var i=0;i < arguments.length;++i) {
        switch (typeof arguments[i]) {
        case 'object':
          if (arguments[i] == null) break;
          var proto = Object.getPrototypeOf(arguments[i]);
          if (proto === Array.prototype) {
            Val.allowIfSimple.apply(Val, arguments[i]);
            break;
          } else if (proto === Date.prototype) break;
          accessDenied("argument is an object ");
        case 'function':
          accessDenied("argument is a function");
        }
      }
      return true;
    },

    allowAccessIf: function (truthy, message) {
      return truthy || accessDenied(message);
    },

    ensureString: function (...args) {ensure(match.string, arguments)},
    ensureNumber: function (...args) {ensure(match.number, args)},
    ensureDate: function (...args) {ensure(match.date, args)},
    ensure: function (type, ...args) {ensure(type, args)},

    errorsToString: function (doc) {
      var errs = doc._errors;

      if (! errs) return;

      var result = [];
      for(var field in errs) {
        var msgs = errs[field].map(function (m) {
          return util.inspect(m);
        });

        result.push(field + ': ' + msgs.join('; '));
      }
      return result.join(', ');
    },

    inspectErrors: function (doc) {
      var errs = this.errorsToString(doc);

      return doc.constructor.modelName + (errs ? ": Errors: " + errs : ": No errors");
    },

    allowIfValid: function (truthy, doc) {
      if (! truthy) {
        if (doc) {
          if (doc._errors)
            var reason = doc._errors;
          else {
            var reason = {}; reason[doc] = [['is_invalid']];
          }
        } else {
          var reason = 'is_invalid';
        }
          throw new koru.Error(400, reason);
      }
      return truthy;
    },

    allowIfFound: function (truthy, field) {
      if (! truthy) {
        if (field) {
          var reason = {}; reason[field] = [['not_found']];
        } else {
          reason = 'Not found';
        }
        throw new koru.Error(404, reason);
      }
    },

    validateName: function (name, length) {
      if (typeof name !== 'string')
        return ['is_required'];

      name = name.trim();

      if (name.length === 0)
        return ['is_required'];

      if (name.length > length)
        return ['cant_be_greater_than', length];

      return name;
    },

    validators: function (validator) {
      return validators[validator];
    },

    register: function (module, map) {
      var registered = [];
      for (var regName in map) {
        var item = map[regName];
        if (typeof item === 'function') {
          validators[regName] = item.bind(this);
          registered.push(regName);
        } else {
          for(var regName in item) {
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

    deregister: function (key) {
      delete validators[key];
    },

    addError: function (doc,field, ...args) {
      var errors = doc._errors || (doc._errors = {}),
          fieldErrors = errors[field] || (errors[field] = []);

      fieldErrors.push(args);
    },
  };

  function accessDenied(details, nolog) {
    var error = new koru.Error(403, "Access denied", details);

    if (! nolog && ! util.thread.suppressAccessDenied)
      koru.info('Access denied: user ' + koru.userId() + ": " + details, koru.util.extractError(error));
    throw error;
  }

  function convertPermitSpec(input) {
    var output = {};

    for(var i=0,item;item=input[i];++i) {
      switch (typeof item) {
      case 'string':
        output[item] = true;
        break;
      case 'object':
        if (Array.isArray(item)) {
          for(var j=0;j < item.length;++j) {
            var obj = item[j];
            for(var key in obj) {
              output[key] = [convertPermitSpec(obj[key])];
            }
          }
        } else {
          for(var key in item) {
            var list = item[key];
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
    for(var i = 0; i < args.length; ++i) {
      type.$test(args[i])  || accessDenied(`expected ${type}`);
    }
  }

  return Val;
});

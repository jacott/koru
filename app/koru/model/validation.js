define(function(require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var ResourceString = require('../resource-string');
  var format = require('../format');

  var validators = {};

  var Val = {
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

    denyAccessIf: function (falsey) {
      this.allowAccessIf(! falsey);
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

    ensureString: function (/* args */) {
      ensureType('string', arguments);
    },

    ensureNumber: function (/* args */) {
      ensureType('number', arguments);
    },

    ensureDate: function () {
      for(var i = 0; i < arguments.length; ++i) {
        (Object.prototype.toString.call(arguments[i]) === "[object Date]")  || accessDenied('expected a date');
      }
    },

    inspectErrors: function (doc) {
      var errs = doc._errors;

      if(errs) {
        var result = [];
        for(var field in errs) {
          var msgs = errs[field].map(function (m) {
            return m.join(', ');
          });

          result.push(field + ': ' + msgs.join('; '));
        }
        return doc.constructor.modelName + ": Errors: " + result.join(', ');
      }
      return doc.constructor.modelName + ": No errors";
    },

    allowIfValid: function (truthy, doc) {
      if (! truthy) {
        if (doc) koru.info('INVALID ' + this.inspectErrors(doc));
        var error = koru.Error(400, 'Invalid request' + (doc ? ": " + Val.inspectErrors(doc) : ''));
        error.doc = doc;
        error.toString = function () {
          return this.message;
        };
        throw error;
      }
      return truthy;
    },

    allowIfFound: function (truthy) {
      if (! truthy) {
        throw new koru.Error(404, 'Not found');
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

    register: function (validator,func) {
      validators[validator] = func;
    },

    deregister: function (validator) {
      delete validators[validator];
    },

    addError: function (doc,field,message /* arguments */) {
      var errors = doc._errors || (doc._errors = {}),
          fieldErrors = errors[field] || (errors[field] = []);

      fieldErrors.push(Array.prototype.slice.call(arguments, 2));
    },

    permitDoc: function (doc, permitSpec, filter) {
      this.permitParams(doc.changes, permitSpec, doc.$isNewRecord(), filter);
    },

    permitParams: function permitParams(changes, permitSpec, isIdAllowed, filter) {
      if (changes instanceof Array) {
        for(var i=0;i < changes.length;++i) {
          permitParams(changes[i], permitSpec, false, filter);
        }
        return true;
      }
      for(var chg in changes) {
        if (chg.match(/[^a-zA-Z0-9._]/))
          accessDenied('Bad key: ' + chg);

        var keys = chg.split('.'),
            val = changes[chg],
            currPs = permitSpec;

        for(var i=0;i < keys.length;++i) {
          var key = keys[i],
              ps = currPs[key];

          if (ps instanceof Array) {
            if (i+1 == keys.length) {
              permitParams(val, ps[0], false, filter);
            } else {
              key = keys[++i];
              key.match(/\D/) && accessDenied('Bad complex key format: ' + chg);

              if (i+1 == keys.length) {
                permitParams(val, ps[0], false, filter);
              } else {
                currPs = ps[0];
              }
            }
          } else if (key === '_id') {
            if (isIdAllowed || ps)
              Val.allowIfSimple(val);
            else if (filter)
              delete currPs[key];
            else
              accessDenied('_id is not allowed');
          } else if (ps) {
            (ps === true && Val.allowIfSimple(val)) ||
              typeof val === 'object' && permitParams(val, ps, false, filter) ||
              accessDenied('bad Key, Value => ' + key + ", " + JSON.stringify(val));
          } else if (filter) {
            delete currPs[key];
          } else {
            accessDenied('unknown key =>' + key);
          }
        }
      }
      return true;
    },

    permitSpec: function (/* arguments */) {
      return convertPermitSpec(typeof arguments[0] === 'object' && typeof arguments[0].length === 'number' ? arguments[0] : arguments);
    },
  };

  function accessDenied(details) {
    var error = new koru.Error(403, "Access denied", details);

    koru.info('Access denied: ', details, koru.util.extractError(error));
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
        if (item instanceof Array) {
          for(var j=0;j < item.length;++j) {
            var obj = item[j];
            for(var key in obj) {
              output[key] = [convertPermitSpec(obj[key])];
            }
          }
        } else {
          for(var key in item) {
            output[key] = convertPermitSpec(item[key]);
          }
        }
        break;
      }
    }

    return output;
  }

  function ensureType(type, args) {
    for(var i = 0; i < args.length; ++i) {
      typeof args[i] === type || accessDenied('expected a ' + type);
    }

  }

  return Val;
});

define(function(require, exports, module) {
  var core = require('bart/core');
  var util = core.util;
  var Val = require('./validation');
  var env = require('../env!./main'); // client-main or server-main
  var Random = require('../random');

  var models = {};
  var modelObservers = {};

  function BaseModel(attributes) {
    if(attributes.hasOwnProperty('_id')) {
      // existing record
      this.attributes = attributes;
      this.changes = {};
    } else {
      // new record
      this.attributes = {};
      this.changes = attributes;
      util.extend(this.changes, this.constructor._defaults);
    }
  }

  BaseModel.prototype = {
    get _id() {return this.attributes._id;},

    $save: env.$save,

    $isValid: function () {
      var doc = this,
          model = doc.constructor,
          fVTors = model._fieldValidators;

      doc._errors = null;

      if(fVTors) {
        for(var field in fVTors) {
          var validators = fVTors[field];
          for(var vTor in validators) {

            var args = validators[vTor];
            var options = args[1];

            if (typeof options === 'function')
              options = options.call(doc, field, args[2]);
            args[0](doc,field, options, args[2]);
          }
        }
      }

      doc.validate && doc.validate();

      return ! doc._errors;
    },

    $assertValid: function () {
      AppVal.allowIfValid(this.$isValid(), this);
    },

    $equals: function (other) {
      if (this === other) return true;
      return other && other._id && this._id && this._id === other._id && this.constructor === other.constructor;
    },

    $isNewRecord: function () {
      return ! this.attributes._id;
    },

    $update: function (value, options) {
      return AppModel[modelName(this)].docs.update(this._id, value, options);
    },

    $change: function (field) {
      if (field in this.changes)
        return this.changes[field];
      return this.changes[field] = Apputil.deepCopy(this[field]);
    },

    $remove: function () {
      var result = AppModel[modelName(this)].fencedRemove(this._id);
      _support.callObserver('afterRemove', this);
      return result;
    },

    $reload: reload,

    $loadCopy: function () {
      return new this.constructor(this.attributes);
    },

    $setFields: function (fields,options) {
      for(var i = 0,field;field = fields[i];++i) {
        if(field != '_id' && options.hasOwnProperty(field)) {
          this[field] = options[field];
        }
      }

      return this;
    },

    get $cache() {return this._cache || (this._cache = {})},

    $cacheRef: function (key) {
      return this.$cache[key] || (this.$cache[key] = {});
    },
  };

  var modelProperties = {
    create: function (attributes) {
      var model = new this();
      util.extend(model.changes, attributes);
      model.$save();
      return model;
    },

  /**
   * Build a new document. Does not copy _id from attributes.
   */
    build: function(attributes, allow_id) {
      var model = new this();
      if(attributes) {
        util.extend(model.changes, attributes);
        allow_id || delete model.changes._id;
      }
      return model;
    },

    findById: function (id) {
      return this.docs[id];
    },

    defineFields: defineFields,
  };




  util.extend(BaseModel, {
    define: function (name, properties, options) {
      properties  = properties || {};
      var model = function (attrs) {
        BaseModel.call(this, attrs||{});
      };

      model.prototype = Object.create(this.prototype, {
        constructor: { value: model },
      });

      util.extend(model.prototype, properties);

      util.extend(model, modelProperties);
      model.constructor = BaseModel;
      model.modelName = name;
      model.docs = {};
      model._fieldValidators = {};
      model._defaults = {};
      return model;
    },

    _destroyModel: function (name) {
      delete models[name];
      ['before', 'after'].forEach(function (ba) {
        ['Create', 'Update', 'Save', 'Remove'].forEach(function (actn) {
          delete modelObservers[name +"." + ba + actn];
        });
      });
    },
  });

  var typeMap = {
    belongs_to: function (model, field, options) {
      var name = field.replace(/_id/,''),
          bt = AppModel[options.modelName || Apputil.capitalize(name)];
      if (bt) {
        model.fieldTypeMap[field] = bt;
        Object.defineProperty(model.prototype, name, {get: belongsTo(bt, name, field)});
      }
    },
    user_id_on_create: function(model, field, options) {
      typeMap.belongs_to.call(this, model, field, options);
      model.userIds = model.userIds || {};
      model.userIds[field] = 'create';
    },
    has_many: function (model, field, options) {
      var name = field.replace(/_ids/,''),
          bt = AppModel[typeof options.associated === 'string' ? options.associated : Apputil.capitalize(name)];
      if (bt) {
        model.fieldTypeMap[field] = bt;
      }
    },


    timestamp: function(model, field) {
      if (/create/i.test(field)) {
        model.createTimestamps = model.createTimestamps || {};
        model.createTimestamps[field] = true;
      } else {
        model.updateTimestamps = model.updateTimestamps || {};
        model.updateTimestamps[field] = true;
      }
    },
  };

  function defineFields(fields) {
    var proto = this.prototype;
    for(var field in fields) {
      var options = fields[field];
      if (! options.type) options = {type: options};
      var func = typeMap[options.type];
      func && func(this, field, options);
      setUpValidators(this, field, options);

      if (options['default'] !== undefined) this._defaults[field] = options['default'];
      defineField(proto,field);
    }
    return this;
  };

  function defineField(proto, field) {
    Object.defineProperty(proto, field,{
      get: getValue(field),

      set: setValue(field),
    });
  }

  function getValue(field) {
    return function () {
      var value = this.changes[field];
      if(value === undefined) {
        return this.attributes[field];
      }
      return value;
    };
  }

  function setValue(field) {
    return function (value) {
      if (value === this.attributes[field]) {
        if (this.changes.hasOwnProperty(field)) {
          if (value === undefined && this.constructor._defaults[field] !== undefined)
            this.changes[field] = this.constructor._defaults[field];
          else
            delete this.changes[field];

          this._setChanges && this._setChanges(field, value);
        }
      } else {
        this.changes[field] = value;
        this._setChanges && this._setChanges(field, value);
      }
      return value;
    };
  }

  function setUpValidators(model, field, options) {
    var validators = getValidators(model, field),
        valFunc;

    if (typeof options === 'object') {

      for(var validator in options) {

        if(valFunc = Val.validators(validator)) {
          validators[validator]=[valFunc, options[validator], options];
        }
      }
    }
  }

  function getValidators(model, field) {
    return model._fieldValidators[field] || (model._fieldValidators[field] = {});
  }

  function reload() {
    if (isServer) {
      var doc = this.constructor.findById(this._id);
      if (! doc) throw core.Error(404, 'Not found');
      this.attributes = doc.attributes;
    }

    this.changes = {};
    this._errors = null;
    this._cache = null;
    this.__arrayFields && (this.__arrayFields = undefined);
    return this;
  }

  return BaseModel;
});

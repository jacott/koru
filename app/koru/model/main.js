define(function(require, exports, module) {
  var env = require('../env');
  var util = require('../util');
  var Val = require('./validation');
  var ModelEnv = require('../env!./main'); // client-main or server-main
  var session = require('../env!../session/main'); // client-main or server-main
  var Random = require('../random');
  var Query = require('./query');
  var makeSubject = require('../make-subject');

  var modelObservers = {};

  var emptyObject = {};

  function BaseModel(attributes, changes) {
    if(attributes.hasOwnProperty('_id')) {
      // existing record
      this.attributes = attributes;
      this.changes = changes || {};
    } else {
      // new record
      this.attributes = {};
      this.changes = attributes;
      util.extend(this.changes, this.constructor._defaults);
    }
  }

  BaseModel.prototype = {
    get _id() {return this.attributes._id;},

    $save: ModelEnv.$save,
    $$save: ModelEnv.$$save,

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
      Val.allowIfValid(this.$isValid(), this);
    },

    $equals: function (other) {
      if (this === other) return true;
      return other && other._id && this._id && this._id === other._id && this.constructor === other.constructor;
    },

    $isNewRecord: function () {
      return ! this.attributes._id;
    },

    $change: function (field) {
      if (field in this.changes)
        return this.changes[field];
      return this.changes[field] = util.deepCopy(this[field]);
    },

    $update: function (changes) {
      return new Query(this.constructor).onId(this._id).update(changes);
    },

    $reload: function () {
      var doc = this.constructor.findById(this._id);
      this.attributes = doc ? doc.attributes : {};
      this.changes = {};
      this._errors = null;
      this._cache = null;
      this.__arrayFields && (this.__arrayFields = undefined);
      return this;
    },

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

  function callObserver(type, doc, changes) {
    var observers = modelObservers[doc.constructor.modelName+'.'+type];
    if (observers) {
      for(var i=0;i < observers.length;++i) {
        observers[i].call(doc, doc, changes, type);
      }
    }
  }


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

    isLocked: function(id) {
      return (this._locks || (this._locks = {})).hasOwnProperty(id);
    },

    lock: function(id, func) {
      if (this.isLocked(id))
        func.call(this, id);
      else {
        this._locks[id] = true;
        try {
          func.call(this, id);
        } finally {
          delete this._locks[id];
        }
      }
    },

    beforeCreate: beforeCreate,
    beforeUpdate: beforeUpdate,
    beforeSave: beforeSave,

    diffToNewOld: function (newDoc, oldDoc, params) {
      if (oldDoc) {
        if (params && ! util.includesAttributes(params, oldDoc, newDoc || emptyObject))
          oldDoc = null;
        else if (newDoc)
          oldDoc = new this(newDoc.attributes, oldDoc);
      }

      if (newDoc && params && ! util.includesAttributes(params, newDoc))
        newDoc = null;

      return [newDoc, oldDoc];
    },

    /**
     * Model extension methods
     */

    defineFields: defineFields,

    addVersioning: function() {
      var model = this,
          proto = model.prototype;

      model.hasVersioning = true;
      Object.defineProperty(proto, '_version', versionProperty);

      proto.$bumpVersion = _support.bumpVersion;
      return this;
    },

    remote: function(funcs) {
      var model = this,
          prefix = model.modelName + '.',
          methods = {};

      for(var key in funcs) {methods[prefix + key] = _support.remote(key,funcs[key]);}
      session.defineRpc(methods);

      return model;
    },

    definePrototypeMethod: function(name, func) {
      var fullname = this.modelName+"."+name;
      this.prototype[name] = function() {
        for(var i=0;i < arguments.length;++i) {
          var curr = arguments[i];
          if (curr && curr._id) arguments[i] = curr._id;
        }
        return session.rpc.apply(session, [fullname, this._id].concat(util.slice(arguments)));
      };
      session.defineRpc(fullname, func);
      return this;
    },
  };

  var versionProperty = {
    get: function () {
      return this.attributes._version;
    },

    set: function (value) {
      this.attributes._version = value;
    }
  };

  var _support = BaseModel._support = {
    setupExtras: [],

    performBumpVersion: function(model, _id, _version) {
      new Query(model).onId(_id).where({_version: _version}).inc("_version", 1).update();
    },

    performInsert: function (doc) {
      var model = doc.constructor;

      callObserver('beforeCreate', doc);
      callObserver('beforeSave', doc);
      model.hasVersioning && (doc.attributes._version = 1);

      ModelEnv.insert(doc);
    },

    performUpdate: function (doc, changes) {
      var model = doc.constructor;

      callObserver('beforeUpdate', doc, changes);
      callObserver('beforeSave', doc, changes);
      var st = new Query(model).onId(doc._id);

      model.hasVersioning && st.inc("_version", 1);

      st.update(changes);
    },
  };

  ModelEnv.init(BaseModel, _support, modelProperties);

  util.extend(BaseModel, {
    /**
     * Define a new model.
     */
    define: function (module, name, properties, options) {
      if (typeof module === 'string') {
        options = properties;
        properties = name;
        name = module;
      } else {
        env.onunload(module, function () {
          BaseModel._destroyModel(name);
        });
        if (typeof name !== 'string') {
          options = properties;
          properties = name;
          name = util.capitalize(util.camelize(module.id.replace(/^.*\//, '')));
        }
      }
      if (name in BaseModel) throw new Error("Model '" + name + "' already defined");
      properties  = properties || {};
      var model = function (attrs, changes) {
        BaseModel.call(this, attrs||{}, changes);
      };

      model.prototype = Object.create(this.prototype, {
        constructor: { value: model },
      });

      util.extend(model.prototype, properties);

      util.extend(model, modelProperties);
      model.constructor = BaseModel;
      model.modelName = name;
      model._fieldValidators = {};
      model._defaults = {};
      makeSubject(model);
      ModelEnv.setupModel(model);

      model.fieldTypeMap = {};

      return BaseModel[name] = model;
    },

    _destroyModel: function (name, drop) {
      ModelEnv.destroyModel(BaseModel[name], drop);
      delete BaseModel[name];
      ['beforeCreate', 'beforeUpdate', 'beforeSave', 'beforeRemove'].forEach(function (actn) {
        delete modelObservers[name +"." + actn];
      });
    },

    _updateTimestamps: function (changes, timestamps, now) {
      if (timestamps) {
        for(var key in timestamps)  {
          changes[key] = changes[key] || now;
        }
      }
    },

    _addUserIds: function (changes, userIds, user_id) {
      if (userIds) {
        for(var key in userIds)  {
          changes[key] = user_id;
        }
      }
    },
  });

  var typeMap = {
    belongs_to: function (model, field, options) {
      var name = field.replace(/_id/,''),
          bt = BaseModel[options.modelName || util.capitalize(name)];
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
          bt = BaseModel[typeof options.associated === 'string' ? options.associated : util.capitalize(name)];
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

  function belongsTo(model, name, field) {
    return function () {
      var value = this[field];
      return value && this.$cacheRef(name)[value] || (this.$cacheRef(name)[value] = model.findById(value));
    };
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

  function beforeCreate(callback) {
    registerObserver(this.modelName+'.beforeCreate', callback);
    return this;
  };

  function beforeUpdate(callback) {
    registerObserver(this.modelName+'.beforeUpdate', callback);
    return this;
  };

  function beforeSave(callback) {
    registerObserver(this.modelName+'.beforeSave', callback);
    return this;
  };

  function registerObserver(name, callback) {
    (modelObservers[name] || (modelObservers[name] = [])).push(callback);
  }

  return BaseModel;
});

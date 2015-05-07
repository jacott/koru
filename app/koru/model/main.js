define(function(require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var Val = require('./validation');
  var ModelEnv = require('../env!./main');
  var session = require('../session/base');
  var Random = require('../random');
  var Query = require('./query');
  var makeSubject = require('../make-subject');
  var registerObserveId = require('./register-observe-id');
  var registerObserveField = require('./register-observe-field');
  var BaseModel = require('./base');

  var modelObservers = {};

  var emptyObject = {};

  koru.onunload(module, function () {
    koru.unload(koru.absId(require, './base'));
  });

  BaseModel.prototype = {
    get _id() {return this.attributes._id || this.changes._id;},

    $inspect: function () {
      return "{Model: " + this.constructor.modelName + "_" + this._id + "  " + this.name + "}";
    },

    $save: function(force) {
      var doc = this;
      switch(force) {
      case 'assert': doc.$assertValid(); break;
      case 'force': break;
      default:
        if (! doc.$isValid())
          return false;
      }
      ModelEnv.save(doc);

      return doc;
    },

    $put: function (updates, value) {
      if (arguments.length === 2) {
        var key = updates;
        updates = {};
        updates[key] = value;
      }

      ModelEnv.put(this, updates);
      return this;
    },

    $$save: function() {
      return this.$save('assert');
    },

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

    $hasChanged: function (field, changes) {
      changes = changes || this.changes;

      if (field in changes) return true;

      var len = field.length;

      for(var key in changes) {
        if (key.length > len && key[len] === "." && key.slice(0, len)  === field) return true;
      }
      return false;
    },

    /**
     * Return a doc representing this doc before the supplied changes
     * were made.
     *
     * If this method is called again with the same changes object
     * then a cached version of the before doc is return.
     */
    $asBefore: function (changes) {
      var cache = this.$cache.$asBefore || (this.$cache.$asBefore = []);
      if (changes === cache[0]) return cache[1];

      cache[0] = changes;

      var simple = true;
      for(var attr in changes) {
        if (attr.indexOf(".") !== -1) {
          simple = false;
          break;
        }
      }

      var attrs = this.attributes;

      if (simple)
        return cache[1] = new this.constructor(attrs, changes);

      var cc = {};

      for(var attr in changes) {
        var index = attr.indexOf(".");
        var desc = Object.getOwnPropertyDescriptor(changes, attr);

        if (index === -1) {
          if (desc.value === undefined)
            delete cc[attr];
          else
            Object.defineProperty(cc, attr, desc);
        } else { // update part of attribute
          var ov, parts = attr.split(".");
          var curr = cc[parts[0]];
          if (! curr)
            curr = cc[parts[0]] = util.deepCopy(attrs[parts[0]]) || {};
          for(var i = 1; i < parts.length - 1; ++i) {
            var part = parts[i];
            curr = curr[part] || (curr[part] = {});
          }
          part = parts[i];
          var m = part.match(/^\$([+\-])(\d+)/);
          if (m) {
            part = +m[2];
            if (m[1] === '-')
              util.removeItem(curr, desc.value);
            else
              util.addItem(curr, desc.value);
          } else if (desc.value === undefined) {
            delete curr[parts[i]];
          } else
            Object.defineProperty(curr, part,  desc);
        }
      }
      return cache[1] = new this.constructor(attrs, cc);
    },

    /**
     * Use the {beforeChange} keys to extract the new values.
     *
     * @returns new hash of extracted values.
     */
    $asChanges: function (beforeChange) {
      var attrs = this.attributes;
      var result = {};
      for(var key in beforeChange) {
        var idx = key.lastIndexOf(".");
        if (idx === -1) {
          result[key] = attrs[key];
        } else if (key[idx+1] !== '$') {
          result[key] = util.lookupDottedValue(key, attrs);
        } else {
          result[key.slice(0, idx+2) + (key[idx+2] === '-' ? '+' : '-') + key.slice(idx+3)] = beforeChange[key];
        }

      }
      return result;
    },

    get $onThis() {
      return new Query(this.constructor).onId(this._id);
    },

    $update: function () {
      var query = this.$onThis;
      return query.update.apply(query, arguments);
    },

    $reload: function () {
      var doc = this.constructor.findById(this._id);
      this.attributes = doc ? doc.attributes : {};
      this.changes = {};
      this._errors = null;
      this._cache = null;
      return this;
    },

    $clearChanges: function () {
      util.isObjEmpty(this.changes) || (this.changes = {});
    },

    $loadCopy: function () {
      return new this.constructor(this.attributes);
    },

    $setFields: function (fields,options) {
      for(var i = 0,field;field = fields[i];++i) {
        if (field[0] !== '_' && options.hasOwnProperty(field)) {
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

  session.defineRpc("put", function (modelName, id, updates) {
    Val.assertCheck([modelName, id], ['string']);
    var model = BaseModel[modelName];
    Val.allowIfFound(model);
    var doc = model.findById(id);
    Val.allowIfFound(doc);

    var parts = _support.validatePut(doc, updates);
    var changes = parts[0], pSum = parts[1];
    var query = doc.$onThis;
    for (var key in pSum) {
      util.extend(changes, pSum[key]);
    }
    doc.changes = {};
    query.put(changes);
  });


  Object.defineProperty(BaseModel, '_callBeforeObserver', {enumerable: false, value: callBeforeObserver});
  Object.defineProperty(BaseModel, '_callAfterObserver', {enumerable: false, value: callAfterObserver});

  function callBeforeObserver(type, doc) {
    var model = doc.constructor;
    var observers = modelObservers[model.modelName+'.'+type];
    if (observers) {
      for(var i=0;i < observers.length;++i) {
        observers[i].call(model, doc, type);
      }
    }
  }

  function callAfterObserver(doc, was) {
    var model = (doc || was).constructor;
    var observers = modelObservers[model.modelName+'.afterLocalChange'];
    if (observers) {
      for(var i=0;i < observers.length;++i) {
        observers[i].call(model, doc, was);
      }
    }
  }

  function callWhenFinally(doc, ex) {
    var model = doc.constructor;
    var observers = modelObservers[model.modelName+'.whenFinally'];
    if (observers) {
      for(var i=0;i < observers.length;++i) {
        try {
          observers[i].call(model, doc, ex);
        } catch(ex1) {
          ex = ex || ex1;
        }
      }
    }
  }


  var modelProperties = {
    create: function (attributes) {
      var doc = new this();
      util.extend(doc.changes, util.deepCopy(attributes));
      doc.$save();
      return isServer ? doc : doc.constructor.findById(doc._id);
    },

    _insertAttrs: function (attrs) {
      if (! attrs._id) attrs._id = Random.id();
      ModelEnv._insertAttrs(this, attrs);
      return attrs._id;
    },

    /**
     * Build a new document. Does not copy _id from attributes.
     */
    build: function(attributes, allow_id) {
      var doc = new this();
      if(attributes) {
        util.extend(doc.changes, util.deepCopy(attributes));
        allow_id || delete doc.changes._id;
      }
      return doc;
    },

    toId: function (doc) {
      if (! doc || typeof doc === 'string') return doc;
      return doc._id;
    },

    get query() {
      return new Query(this);
    },

    where: function () {
      var query = this.query;
      return query.where.apply(query, arguments);
    },

    onId: function (id) {
      return this.query.onId(id);
    },

    exists: function (condition) {
      var query = new Query(this);
      if (typeof condition === 'string')
        query.onId(condition);
      else
        query.where(condition);

      return query.count(1) !== 0;
    },

    findBy: function (field, value) {
      return this.query.where(field, value).fetchOne();
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
    beforeRemove: beforeRemove,

    afterLocalChange: afterLocalChange,
    whenFinally: whenFinally,

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
      var prefix = this.modelName + '.';

      for(var key in funcs) {
        session.defineRpc(prefix + key, _support.remote(key,funcs[key]));
      }

      return this;
    },

    definePrototypeMethod: function(name, func) {
      var fullname = this.modelName+"."+name;
      this.prototype[name] = function() {
        for(var i=0;i < arguments.length;++i) {
          var curr = arguments[i];
          if (curr && curr._id) arguments[i] = curr._id;
        }
        return session.rpc.apply(session, util.append([fullname, this._id], arguments));
      };
      func && session.defineRpc(fullname, func);
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

  var _support = {
    setupExtras: [],

    validatePut: function (doc, updates) {
      var userId = koru.userId();
      Val.allowAccessIf(userId && doc.authorizePut);
      var changes = {};
      var partials = {};
      for (var key in updates) {
        var pos = key.indexOf(".");
        if (pos === -1)
          changes[key] = updates[key];
        else {
          var mainKey = key.slice(0, pos);
          var section = partials[mainKey] || (partials[mainKey] = {});
          section[key] = updates[key];
        }
      }
      doc.changes = changes;
      if (typeof doc.authorizePut === 'function')
        doc.authorizePut(userId, partials);
      else {
        doc.authorize && doc.authorize(userId, {put: partials});
        for (var key in partials) {
          var validator = doc.authorizePut[key];
          Val.allowAccessIf(validator, 'no validator for ' + key);
          validator(doc, partials[key]);
        }

      }
      doc.$assertValid();

      return [changes, partials];
    },

    performBumpVersion: function(model, _id, _version) {
      new Query(model).onId(_id).where({_version: _version}).inc("_version", 1).update();
    },

    performInsert: function (doc) {
      var model = doc.constructor;

      doc.changes = doc.attributes;
      var attrs = doc.attributes = {};

      try {
        var ex;
        callBeforeObserver('beforeCreate', doc);
        callBeforeObserver('beforeSave', doc);


        doc.attributes = doc.changes;
        doc.changes = attrs;
        model.hasVersioning && (doc.attributes._version = 1);

        ModelEnv.insert(doc);
      } catch(ex1) {
        ex = ex1;
      } finally {
        callWhenFinally(doc, ex);
      }
      if (ex) throw ex;
    },

    performUpdate: function (doc, changes) {
      var model = doc.constructor;

      doc.changes = changes;

      try {
        var ex;
        callBeforeObserver('beforeUpdate', doc);
        callBeforeObserver('beforeSave', doc);
        var st = new Query(model).onId(doc._id);

        model.hasVersioning && st.inc("_version", 1);

        doc.changes = {};
        st.update(changes);
      } catch(ex1) {
        ex = ex1;
      } finally {
        callWhenFinally(doc, ex);
      }
      if (ex) throw ex;
    },
  };

  ModelEnv.init(BaseModel, _support, modelProperties);

  util.extendNoEnum(BaseModel, {
    /**
     * Define a new model.
     */
    define: function (module, name, properties, options) {
      if (typeof module === 'string') {
        options = properties;
        properties = name;
        name = module;
      } else {
        koru.onunload(module, function () {
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
      var model = newModel(this, name);

      model.prototype = Object.create(this.prototype, {
        constructor: { value: model },
      });

      util.extend(model.prototype, properties);

      util.extend(model, modelProperties);
      model.constructor = BaseModel;
      model.modelName = name;
      model._fieldValidators = {};
      model._defaults = {};
      model.hasMany = hasMany;
      makeSubject(model);
      ModelEnv.setupModel(model);

      model.fieldTypeMap = {};

      registerObserveId(model);
      registerObserveField(model);

      return BaseModel[name] = model;
    },

    _support: _support,

    _destroyModel: function (name, drop) {
      var model = BaseModel[name];
      if (! model) return;

      ModelEnv.destroyModel(model, drop);

      delete BaseModel[name];

      util.forEach(['beforeCreate', 'beforeUpdate', 'beforeSave', 'beforeRemove', 'afterLocalChange'], function (actn) {
        delete modelObservers[name +"." + actn];
      });
      if (model._observing) for(var i = 0; i < model._observing.length; ++i) {
        delete modelObservers[model._observing[i]];
      }
      model._observing = null;
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
          changes[key] = changes[key] || user_id;
        }
      }
    },

    _modelProperties: modelProperties,
  });

  var typeMap = {
    belongs_to: function (model, field, options) {
      var name = field.replace(/_id/,'');
      var bt = options.model;
      if (! bt) {
        var btName = options.modelName || util.capitalize(name);
        var bt = BaseModel[btName];
      }
      mapFieldType(model, field, bt, btName);
      Object.defineProperty(model.prototype, name, {get: belongsTo(bt, name, field)});
    },

    user_id_on_create: function(model, field, options) {
      typeMap.belongs_to.call(this, model, field, options);
      model.userIds = model.userIds || {};
      model.userIds[field] = 'create';
    },

    has_many: function (model, field, options) {
      var bt = options.model;
      if (! bt) {
        var name = options.modelName ||
              (options.associated &&
               (typeof options.associated === 'string' ?
                options.associated : options.associated.modelName)) ||
              util.capitalize(util.sansId(field));

        bt = BaseModel[name];
      }
      mapFieldType(model, field, bt, name);
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

  function mapFieldType(model, field, bt, name) {
    if (! bt) throw Error(name + ' is not defined for field: ' + field);
    model.fieldTypeMap[field] = bt;
  }

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

  function hasMany(name, model, finder) {
    Object.defineProperty(this.prototype, name, {get: function () {
      var query = model.query;
      finder.call(this, query);
      return query;
    }});
  }

  function getValue(field) {
    return function () {
      return this.changes.hasOwnProperty(field) ? this.changes[field] : this.attributes[field];
    };
  }

  function setValue(field) {
    return function (value) {
      if (value === this.attributes[field]) {
        if (this.changes.hasOwnProperty(field)) {
          if (value === undefined && this.constructor._defaults[field] !== undefined)
            this.changes[field] = util.deepCopy(this.constructor._defaults[field]);
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

  function beforeCreate(subject, callback) {
    registerObserver(this, subject, 'beforeCreate', callback);
    return this;
  };

  function beforeUpdate(subject, callback) {
    registerObserver(this, subject, 'beforeUpdate', callback);
    return this;
  };

  function beforeSave(subject, callback) {
    registerObserver(this, subject, 'beforeSave', callback);
    return this;
  };

  function beforeRemove(subject, callback) {
    registerObserver(this, subject, 'beforeRemove', callback);
    return this;
  };

  function afterLocalChange(subject, callback) {
    registerObserver(this, subject, 'afterLocalChange', callback);
    return this;
  };

  function whenFinally(subject, callback) {
    registerObserver(this, subject, 'whenFinally', callback);
    return this;
  };

  function registerObserver(model, subject, name, callback) {
    name = subject.modelName + "." + name;
    (model._observing = model._observing || []).push(name);
    (modelObservers[name] || (modelObservers[name] = [])).push(callback);
  }

  function newModel(baseModel, name) {
    function Model(attrs, changes) {
      BaseModel.call(this, attrs||{}, changes);
    };
    return Model;
  }

  return BaseModel;
});

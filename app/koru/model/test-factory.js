define(function(require, exports, module) {
  var Model = require('./main');
  var util = require('../util');
  var test = require('../test');

  var Factory = {
    clear: function () {
      last = {};
      nameGen = {};
    },

    createList: function (number, creator /* arguments */) {
      var list = [],
          args = util.slice(arguments, 2);

      var func = typeof args[0] === 'function' ? args.shift() : null;

      args[0] = args[0] || {};

      for(var i=0;i < number;++i) {
        func && func.apply(args, [i].concat(args));
        list.push(this[creator].apply(this,args));
      }
      return list;
    },

    get last () {
      return last;
    },

    setLastNow: function (now) {
      lastNow = now;
    },

    lastOrCreate: function (name) {
      return last[name] || Factory['create'+util.capitalize(name)]();
    },

    getUniqueNow: getUniqueNow,
    generateName: generateName,

    traits: function (funcs) {
      util.extend(traits, funcs);
      return this;
    },

    /** Add a function for any action needed to happen after doc created */
    postCreate: function (funcs) {
      util.extend(postCreate, funcs);
      return this;
    },

    defines: function (defines) {
      for(var key in defines) {
        this['build'+key] = buildFunc(key, defines[key]);
        this['create'+key] = createFunc(key, defines[key]);
      }
      return this;
    },

    BaseBuilder: BaseBuilder,
    Builder: Builder,
  };

  var traits = {};
  var postCreate = {};

  var nameGen, last, lastNow;

  test.geddon.onTestStart(function () {
    nameGen = {};
    last = {};
    lastNow = null;
  });

  var defines = {};

  for(var key in defines) {
    Factory['build'+key] = buildFunc(key, defines[key]);
    Factory['create'+key] = createFunc(key, defines[key]);
  }

  function buildFunc(key, def) {
    return function (/** traits and options */) {
      return def.call(Factory, buildOptions(key, arguments)).build();
    };
  }

  function createFunc(key, def) {
    return function (/** traits and options */) {
      var result =
            def.call(Factory, buildOptions(key, arguments)).create();

      if (postCreate[key])
        return postCreate[key](result, key, arguments);
      else
        return last[key.substring(0,1).toLowerCase()+key.substring(1)] = result;
    };
  }

  function buildOptions(key, args) {
    var options = {}, keyTraits = traits[key] || {};
    for(var i=0;i < args.length;++i) {
      if (typeof args[i] === 'string') {
        var trait = keyTraits[args[i]];
        if (!trait) throw new Error('unknown trait "'+ args[i] +'" for ' + key);
        util.extend(options, typeof trait === 'function' ? trait.call(keyTraits, options, args, i) : trait);
      } else if(args[i]) {
        util.extend(options, args[i]);
      }
    }
    return options;
  }

  function getUniqueNow() {
    var now = Date.now();

    if(lastNow && now <= lastNow) {
      now = ++lastNow;
    } else {
      lastNow = now;
    }

    return new Date(now);
  }

  function generateName(prefix, space) {
    if (typeof(nameGen[prefix]) != 'number') (nameGen[prefix] = 0);
    return prefix + (space == null ? ' ' : space) + ++nameGen[prefix];
  }

  function BaseBuilder(options, default_opts) {
    this.options = options || {};
    this.default_opts = default_opts || {};
  }

  /**
   * Builder
   *
   **/

  function Builder(modelName, options, default_opts) {
    this.model = Model[modelName];
    if (! this.model) throw new Error('Model: "'+modelName+'" not found');
    BaseBuilder.call(this, options, util.extend(util.extend({}, this.model._defaults), default_opts || {}));
  }

  util.extend(BaseBuilder.prototype, {
    addField: function (field, value) {
      if (! this.options.hasOwnProperty(field)) {
        switch(typeof value) {
        case 'undefined': break;
        case 'function':
          this.default_opts[field] = value();
          break;
        default:
          this.default_opts[field] = value;
        }
      }
      return this;
    },

    field: function (field) {
      return (this.options.hasOwnProperty(field) ? this.options : this.default_opts)[field];
    },

    attributes: function () {
      var result = {};
      addAttributes(this.default_opts);
      addAttributes(this.options);
      return result;

      function addAttributes(attrs) {
        for(var key in attrs) {
          var value = attrs[key];
          if (value !== undefined)
            result[key] = value;
        }
      }
    },

    field: function (name) {
      if (name in this.options) return this.options[name];
      return this.default_opts[name];
    },
  });

  Builder.prototype = util.extend(Object.create(BaseBuilder.prototype, {}), {
    constructor: Builder,

    addRef: function(ref, doc) {
      var refId = ref+'_id';
      if (! this.options.hasOwnProperty(refId)) {
        var model = this.model.fieldTypeMap[refId];
        if (! model) throw new Error('model not found for reference: ' + refId + ' in model ' + this.model.modelName);
        var modelName = model.modelName;
        doc = doc ||
          (doc === undefined && (last[ref] || last[util.uncapitalize(modelName)])) ||
          (Factory['create'+util.capitalize(ref)] || Factory['create'+modelName])();
        this.default_opts[refId] = doc._id === undefined ? doc : doc._id;
      }
      return this;
    },

    genName: function (field, prefix) {
      return this.addField(field || 'name', generateName(prefix || this.model.modelName));
    },

    canSave: function (value) {
      this._canSave = value;
      return this;
    },

    insert: function () {
      var id = this.model._insertAttrs(this.attributes());
      var doc = this.model.findById(id);
      if (! doc) {
        throw Error("Factory insert failed! " + this.model.modelName + ": " + id);
      }
      isClient && this.model._indexUpdate.notify(doc);
      Model._callAfterObserver(doc);
      this.model.notify(doc);
      return doc;
    },

    build: function () {
      var doc = new this.model();
      util.extend(doc.changes, this.attributes());
      return doc;
    },

    create: function () {
      if (this._canSave) {
        var doc = this.model.build({});
        doc.changes = this.attributes();
        if (this._canSave === 'force')
          doc.$save('force');
        else
          doc.$$save();
        doc = this.model.findById(doc._id) || doc;
      } else
        var doc = this.insert();


      this._afterCreate && this._afterCreate.call(this, doc);
      return doc;
    },

    afterCreate: function (func) {
      this._afterCreate = func;
      return this;
    },
  });

  return Factory;
});

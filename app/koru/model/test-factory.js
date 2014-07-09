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
          args = Array.prototype.slice.call(arguments, 2);

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

  function generateName(prefix) {
    if (typeof(nameGen[prefix]) != 'number') (nameGen[prefix] = 0);
    return prefix + ' ' + ++nameGen[prefix];
  }

  /**
   * Builder
   *
   **/

  function Builder(modelName, options, default_opts) {
    this.model = Model[modelName];
    if (! this.model) throw new Error('Model: "'+modelName+'" not found');
    this.options = options || {};
    this.default_opts = util.extend(util.extend({}, this.model._defaults), default_opts || {});
  }

  util.extend(Builder.prototype, {
    addRef: function(ref, doc) {
      var refId = ref+'_id';
      if (! this.options.hasOwnProperty(refId)) {
        doc = doc || (doc === undefined && last[ref]) || Factory['create'+util.capitalize(ref)]();
        this.default_opts[refId] = doc._id === undefined ? doc : doc._id;
      }
      return this;
    },

    canSave: function (value) {
      this._canSave = value;
      return this;
    },

    genName: function (field, prefix) {
      return this.addField(field || 'name', generateName(prefix || this.model.modelName));
    },

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

    insert: function () {
      var doc = this.model.findById(this.model._insertAttrs(this.attributes()));
      this.model.notify(doc);
      return doc;
    },

    build: function () {
      var doc = new this.model();
      util.extend(doc.changes, this.attributes());
      return doc;
    },

    create: function () {
      if (this._canSave === true)
        var doc = this.model.create(this.attributes());
      else if (this._canSave === 'force') {
        var doc = this.model.build(this.attributes());
        doc.$save('force');
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

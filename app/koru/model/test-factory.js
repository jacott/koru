define(function(require, exports, module) {
  const test  = require('../test');
  const util  = require('../util');
  const Model = require('./main');

  const traits = {};
  const postCreate = {};
  const defines = {};

  let nameGen, last, lastNow;

  class BaseBuilder {
    constructor(options={}, default_opts={}) {
      this.options = options;
      this.default_opts = default_opts;
    }

    addField(field, value) {
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
    }

    field(field) {
      return (this.options.hasOwnProperty(field) ? this.options : this.default_opts)[field];
    }

    attributes() {
      const result = {};
      addAttributes(this.default_opts);
      addAttributes(this.options);
      return result;

      function addAttributes(attrs) {
        for(let key in attrs) {
          const value = attrs[key];
          if (value !== undefined)
            result[key] = value;
        }
      }
    }

    field(name) {
      if (name in this.options) return this.options[name];
      return this.default_opts[name];
    }
  }

  class Builder extends BaseBuilder {
    constructor(modelName, options, default_opts={}) {
      super(options, {});
      this.model = Model[modelName];
      if (! this.model) throw new Error('Model: "'+modelName+'" not found');
      util.merge(util.merge(this.default_opts, this.model._defaults), default_opts);
    }

    addRef(ref, doc) {
      var refId = ref+'_id';
      if (! this.options.hasOwnProperty(refId)) {
        var model = this.model.fieldTypeMap[refId];
        if (! model) throw new Error('model not found for reference: ' + refId + ' in model ' + this.model.modelName);
        var modelName = model.modelName;
        if (typeof doc === 'function')
          doc = doc(this);
        doc = doc ||
          (doc === undefined && (last[ref] || last[util.uncapitalize(modelName)])) ||
          (Factory['create'+util.capitalize(ref)] || Factory['create'+modelName])();
        this.default_opts[refId] = doc._id === undefined ? doc : doc._id;
      }
      return this;
    }

    genName(field, prefix) {
      return this.addField(field || 'name', generateName(prefix || this.model.modelName));
    }

    canSave(value) {
      this._canSave = value;
      return this;
    }

    insert() {
      var id = this.model._insertAttrs(this.attributes());
      var doc = this.model.findById(id);
      if (! doc) {
        throw Error("Factory insert failed! " + this.model.modelName + ": " + id);
      }
      isClient && this.model._indexUpdate.notify(doc);
      Model._support.callAfterObserver(doc);
      this.model.notify(doc);
      return doc;
    }

    build() {
      var doc = new this.model();
      util.merge(doc.changes, this.attributes());
      return doc;
    }

    create() {
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
    }

    afterCreate(func) {
      this._afterCreate = func;
      return this;
    }
  }

  const tx = [];

  const Factory = module.exports = {
    startTransaction() {
      tx.push([last, nameGen]);
      last = util.merge({}, last);
      nameGen = util.merge({}, nameGen);
    },

    endTransaction() {
      if (tx.length === 0)
        throw new Error("No transaction in progress!");
      [last, nameGen] = tx.pop();
    },

    clear() {
      if (tx.length !== 0)
        throw new Error("Transaction in progress!");
      last = {};
      nameGen = {};
    },

    createList(number, creator, ...args) {
      const list = [];

      const func = typeof args[0] === 'function' ? args.shift() : null;

      if (args.length === 0 || typeof args[args.length - 1] === 'string')
        args.push({});

      for(let i = 0; i < number; ++i) {
        func && func.apply(args, [i, args[args.length - 1]]);
        list.push(this[creator].apply(this,args));
      }
      return list;
    },

    get last () {
      return last;
    },

    setLastNow(now) {
      lastNow = now;
    },

    lastOrCreate(name) {
      return last[name] || Factory['create'+util.capitalize(name)]();
    },

    getUniqueNow,
    generateName,

    traits(funcs) {
      util.merge(traits, funcs);
      return this;
    },

    /** Add a function for any action needed to happen after doc created */
    postCreate(funcs) {
      util.merge(postCreate, funcs);
      return this;
    },

    defines(defines) {
      for(var key in defines) {
        this['build'+key] = buildFunc(key, defines[key]);
        this['create'+key] = createFunc(key, defines[key]);
      }
      return this;
    },

    BaseBuilder,
    Builder,
  };

  test.geddon.onTestStart(function () {
    nameGen = {};
    last = {};
    lastNow = null;
  });

  function buildFunc(key, def) {
    return function (...args /** traits and options */) {
      return def.call(Factory, buildOptions(key, args)).build();
    };
  }

  function createFunc(key, def) {
    return function (...args /** traits and options */) {
      const result =
            def.call(Factory, buildOptions(key, args)).create();

      if (postCreate[key])
        return postCreate[key](result, key, args);
      else
        return last[key.substring(0,1).toLowerCase()+key.substring(1)] = result;
    };
  }

  function buildOptions(key, args) {
    const options = {}, keyTraits = traits[key] || {};
    for(let i=0; i < args.length;++i) {
      if (typeof args[i] === 'string') {
        const trait = keyTraits[args[i]];
        if (!trait) throw new Error('unknown trait "'+ args[i] +'" for ' + key);
        util.merge(options, typeof trait === 'function' ?
                   trait.call(keyTraits, options, args, i) : trait);
      } else if(args[i]) {
        util.merge(options, args[i]);
      }
    }
    return options;
  }

  function getUniqueNow() {
    let now = util.dateNow();

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
});

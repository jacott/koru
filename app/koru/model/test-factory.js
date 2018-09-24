define((require)=>{
  const dbBroker        = require('koru/model/db-broker');
  const DocChange       = require('koru/model/doc-change');
  const TH              = require('koru/test-helper');
  const util            = require('../util');
  const Model           = require('./main');

  const {hasOwn, deepCopy} = util;

  const traits = {};
  const postCreate = {};
  const defines = {};

  let nameGen, last, lastNow, tx, dbId, dbVars;
  const dbs = {};

  const switchDb = ()=> {
    dbId = dbBroker.dbId;
    if (dbs[dbId] === undefined) {
      dbs[dbId] = {tx: [], nameGen: {}, last: {}, lastNow};
    }
    dbVars = dbs[dbId];
    nameGen = dbVars.nameGen;
    last = dbVars.last;
    lastNow = dbVars.lastNow;
    tx = dbVars.tx;
  };

  const checkDb = ()=>{dbBroker.dbId === dbId || switchDb()};

  const getUniqueNow = ()=>{
    checkDb();
    let now = util.dateNow();

    if(lastNow && now <= lastNow) {
      now = ++lastNow;
    } else {
      lastNow = now;
    }

    return new Date(now);
  };

  const generateName = (prefix, space)=>{
    checkDb();
    if (typeof(nameGen[prefix]) != 'number') (nameGen[prefix] = 0);
    return `${prefix}${space == null ? ' ' : space}${++nameGen[prefix]}`;
  };


  class BaseBuilder {
    constructor(options={}, default_opts={}) {
      this.options = options;
      this.default_opts = default_opts;
    }

    addField(field, value) {
      if (! hasOwn(this.options, field)) {
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
      return (hasOwn(this.options, field) ? this.options : this.default_opts)[field];
    }

    attributes() {
      const result = {};
      const addAttributes = attrs =>{
        for(const key in attrs) {
          const value = attrs[key];
          if (value !== undefined)
            result[key] = value;
        }
      };
      addAttributes(this.default_opts);
      addAttributes(this.options);
      return result;
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
      Object.assign(this.default_opts, this.model._defaults, default_opts);
    }

    addRef(ref, doc) {
      const refId = `${ref}_id`;
      if (! hasOwn(this.options, refId)) {
        const model = this.model.fieldTypeMap[refId];
        if (! model) throw new Error(
          `model not found for reference: ${refId} in model ${this.model.modelName}`);
        const {modelName} = model;
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
      const id = this.model._insertAttrs(this.attributes());
      const doc = this.model.findById(id);
      if (doc == null)
        throw Error("Factory insert failed! " + this.model.modelName + ": " + id);

      const dc = DocChange.add(doc);
      isClient && this.model._indexUpdate.notify(dc);
      Model._support.callAfterLocalChange(dc);
      this.model.notify(dc);
      return doc;
    }

    build() {
      const doc = new this.model();
      Object.assign(doc.changes, this.attributes());
      return doc;
    }

    create() {
      let doc;
      if (this._canSave) {
        doc = this.model.build({});
        doc.changes = this.attributes();
        if (this._canSave === 'force')
          doc.$save('force');
        else
          doc.$$save();
      } else
        doc = this.insert();


      this._afterCreate && this._afterCreate.call(this, doc);
      return doc;
    }

    afterCreate(func) {
      this._afterCreate = func;
      return this;
    }
  }

  const Factory = {
    startTransaction() {
      checkDb();
      tx.push([last, nameGen]);
      last = Object.assign({}, last);
      dbVars.nameGen = nameGen = Object.assign({}, nameGen);
    },

    endTransaction() {
      checkDb();
      if (tx.length === 0) {
        throw new Error("No transaction in progress!");
      }
      [last, nameGen] = tx.pop();
      dbVars.nameGen = nameGen;
      dbVars.last = last;
    },

    preserve(sym, docs) {
      for(let i = docs.length-1; i >= 0; --i) {
        const doc = docs[i];
        doc[sym] = deepCopy(doc.attributes);
      }
    },

    restore(sym, docs) {
      for(let i = docs.length-1; i >= 0; --i) {
        const doc = docs[i];
        doc.attributes = deepCopy(doc[sym]);
        doc.$reload();
      }
    },

    clearSym(sym, docs) {
      for(let i = docs.length-1; i >= 0; --i) {
        delete docs[i][sym];
      }
    },

    clear() {
      checkDb();
      if (tx.length !== 0) {
        throw new Error("Transaction in progress!");
      }
      dbVars.last = last = {};
      dbVars.nameGen = nameGen = {};
    },

    get inTransaction() {
      checkDb();
      return tx.length != 0;
    },

    createList(number, creator, ...args) {
      checkDb();
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
      checkDb();
      return last;
    },

    setLastNow(now) {
      checkDb();
      lastNow = now;
    },

    lastOrCreate(name) {
      checkDb();
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
      for(const key in defines) {
        this['build'+key] = buildFunc(key, defines[key]);
        this['create'+key] = createFunc(key, defines[key]);
      }
      return this;
    },

    BaseBuilder,
    Builder,
  };

  const buildFunc = (key, def)=> (...traitsAndOptions)=>{
    checkDb();
    return def.call(
      Factory, buildOptions(key, traitsAndOptions)).build();
  };

  const createFunc = (key, def)=> (...traitsAndOptions)=>{
    checkDb();
    const result =
            def.call(Factory, buildOptions(key, traitsAndOptions)).create();

    if (postCreate[key])
      return postCreate[key](result, key, traitsAndOptions);
    else
      return last[key.substring(0,1).toLowerCase()+key.substring(1)] = result;
  };

  const buildOptions = (key, args)=>{
    const options = {}, keyTraits = traits[key] || {};
    for(let i=0; i < args.length;++i) {
      if (typeof args[i] === 'string') {
        const trait = keyTraits[args[i]];
        if (!trait) throw new Error('unknown trait "'+ args[i] +'" for ' + key);
        Object.assign(options, typeof trait === 'function' ?
                      trait.call(keyTraits, options, args, i) : trait);
      } else if(args[i]) {
        Object.assign(options, args[i]);
      }
    }
    return options;
  };

  return Factory;
});

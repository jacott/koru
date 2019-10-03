define((require)=>{
  'use strict';
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
    constructor(attributes={}, defaults={}) {
      this.attributes = attributes;
      this.defaults = defaults;
    }

    addField(field, value) {
      if (! hasOwn(this.attributes, field)) {
        switch(typeof value) {
        case 'undefined': break;
        case 'function':
          this.defaults[field] = value();
          break;
        default:
          this.defaults[field] = value;
        }
      }
      return this;
    }

    field(field) {
      return (hasOwn(this.attributes, field) ? this.attributes : this.defaults)[field];
    }

    makeAttributes() {
      const result = {};
      const addAttributes = attributes =>{
        for(const key in attributes) {
          const value = attributes[key];
          if (value !== undefined)
            result[key] = value;
        }
      };
      addAttributes(this.defaults);
      addAttributes(this.attributes);
      return result;
    }
  }

  class Builder extends BaseBuilder {
    constructor(modelName, attributes, defaults={}) {
      super(attributes, {});
      this.model = Model[modelName];
      this._useSave = '';
      if (! this.model) throw new Error('Model: "'+modelName+'" not found');
      Object.assign(this.defaults, this.model._defaults, defaults);
    }

    addRef(ref, doc) {
      const refId = `${ref}_id`;
      if (! hasOwn(this.attributes, refId)) {
        const model = this.model.fieldTypeMap[refId];
        if (! model) throw new Error(
          `model not found for reference: ${refId} in model ${this.model.modelName}`);
        const {modelName} = model;
        if (typeof doc === 'function')
          doc = doc(this);
        if (doc === void 0) {
          doc = last[ref] || last[util.uncapitalize(modelName)];
        }
        if (doc == null) {
          const func = Factory['create'+util.capitalize(ref)] || Factory['create'+modelName];
          if (func === void 0)
            throw new Error("can't find factory create for "+modelName);
          doc = func();
        }
        this.defaults[refId] = doc._id === void 0 ? doc : doc._id;
      }
      return this;
    }

    genName(field, prefix) {
      return this.addField(field || 'name', generateName(prefix || this.model.modelName));
    }

    useSave(value) {
      this._useSave = value === 'force' ? value : (value ? "assert" : '');
      return this;
    }

    insert() {
      const id = this.model._insertAttrs(this.makeAttributes());
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
      Object.assign(doc.changes, this.makeAttributes());
      return doc;
    }

    create() {
      let doc;
      if (this._useSave !== '') {
        doc = this.model.build({});
        doc.changes = this.makeAttributes();
        doc.$save(this._useSave);
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

    defines(models) {
      for(const key in models) {
        this['build'+key] = buildFunc(key, models[key]);
        this['create'+key] = createFunc(key, models[key]);
      }
      return this;
    },

    BaseBuilder,
    Builder,
  };

  const buildFunc = (key, def)=> (...traitsAndAttributes)=>{
    checkDb();
    return def.call(
      Factory, buildAttributes(key, traitsAndAttributes)).build();
  };

  const createFunc = (key, def)=> (...traitsAndAttributes)=>{
    checkDb();
    const result =
            def.call(Factory, buildAttributes(key, traitsAndAttributes)).create();

    if (postCreate[key] !== void 0)
      return postCreate[key](result, key, traitsAndAttributes);
    else
      return last[key.substring(0,1).toLowerCase()+key.substring(1)] = result;
  };

  const buildAttributes = (key, args)=>{
    const attributes = {}, keyTraits = traits[key] || {};
    for(let i=0; i < args.length;++i) {
      if (typeof args[i] === 'string') {
        const trait = keyTraits[args[i]];
        if (!trait) throw new Error('unknown trait "'+ args[i] +'" for ' + key);
        Object.assign(attributes, typeof trait === 'function' ?
                      trait.call(keyTraits, attributes, args, i) : trait);
      } else if(args[i]) {
        Object.assign(attributes, args[i]);
      }
    }
    return attributes;
  };

  return Factory;
});

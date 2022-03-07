define((require) => {
  'use strict';
  const dbBroker        = require('koru/model/db-broker');
  const DocChange       = require('koru/model/doc-change');
  const Observable      = require('koru/observable');
  const TH              = require('koru/test-helper');
  const Model           = require('./main');
  const util            = require('../util');

  const promises$ = Symbol();

  const {hasOwn, deepCopy} = util;

  const traits = {};
  const postCreate = {};
  const defines = {};

  let seqGen, last, lastNow, tx, dbId, dbVars;
  const dbs = {};

  const switchDb = () => {
    dbId = dbBroker.dbId;
    if (dbs[dbId] === undefined) {
      dbs[dbId] = {tx: [], seqGen: {}, last: {}, lastNow};
    }
    dbVars = dbs[dbId];
    seqGen = dbVars.seqGen;
    last = dbVars.last;
    lastNow = dbVars.lastNow;
    tx = dbVars.tx;
  };

  const checkDb = () => {dbBroker.dbId === dbId || switchDb()};

  const getUniqueNow = () => {
    checkDb();
    let now = util.dateNow();

    if (lastNow && now <= lastNow) {
      now = ++lastNow;
    } else {
      lastNow = now;
    }

    return new Date(now);
  };

  const generateSeq = (key) => (
    checkDb(), typeof (seqGen[key]) === 'number' ? ++seqGen[key] : (seqGen[key] = 1));

  const generateName = (prefix, space=' ') => `${prefix}${space}${generateSeq(prefix)}`;

  class BaseBuilder {
    constructor(attributes={}, defaults={}) {
      this.attributes = attributes;
      this.defaults = defaults;
    }

    addField(field, value) {
      this.afterPromises(() => {
        if (! hasOwn(this.attributes, field)) {
          switch (typeof value) {
          case 'undefined': break;
          case 'function': value = value();
          default:
            if (value instanceof Promise) {
              this.addPromise(value.then((value) => {this.defaults[field] = value}));
            } else {
              this.defaults[field] = value;
            }
          }
        }
      });
      return this;
    }

    field(field) {
      return (hasOwn(this.attributes, field) ? this.attributes : this.defaults)[field];
    }

    makeAttributes() {
      const p = this.waitPromises();
      if (p instanceof Promise) {
        return p.then(() => this.makeAttributes());
      }

      const result = {};
      const addAttributes = (attributes) => {
        for (const key in attributes) {
          const value = attributes[key];
          if (value !== undefined) {
            result[key] = value;
          }
        }
      };
      addAttributes(this.defaults);
      addAttributes(this.attributes);
      return result;
    }
  }

  const insertNotify = (self, doc, id) => {
    if (doc == null) {
      throw Error('Factory insert failed! ' + self.model.modelName + ': ' + id);
    }
    const insertNotify_3 = () => {
      const p = self.model.notify(dc);
      if (p instanceof Promise) return p.then(() => doc);
      return doc;
    };

    const insertNotify_2 = () => {
      const p = Model._support.callAfterLocalChange(dc);
      if (p instanceof Promise) return p.then(insertNotify_3);
      return insertNotify_3();
    };

    const dc = DocChange.add(doc);
    if (isClient) {
      const p = self.model._indexUpdate.notify(dc);
      if (p instanceof Promise) return p.then(insertNotify_2);
    }
    return insertNotify_2();
  };

  const asyncInsert = async (self, p) => {
    const id = await self.model._insertAttrs(await p);

    const doc = await self.model.findById(id);
    if (doc == null) {
      throw Error('Factory insert failed! ' + self.model.modelName + ': ' + id);
    }

    return insertNotify(self, doc, id);
  };

  const asyncAddRef = async (self, p, ref, refId, modelName) => {
    const doc = await p;
    if (doc === void 0) {
      doc = last[ref] ?? last[util.uncapitalize(modelName)];
    }
    if (doc == null) {
      const func = Factory['create' + util.capitalize(ref)] ?? Factory['create' + modelName];
      if (func === void 0) {
        throw new Error("can't find factory create for " + modelName);
      }
      doc = await func();
    }
    self.defaults[refId] = doc._id === void 0 ? doc : doc._id;
    return self;
  };

  const asyncAfterCreate = (self, doc) => {
    if (self._afterCreate !== void 0) {
      const p = self._afterCreate.notify(doc, self);
      if (p instanceof Promise) return p.then(() => doc);
    }
    return doc;
  };

  const waitInSequence = async (promises) => {
    for (const p of promises) {
      await p;
    }
  };

  class Builder extends BaseBuilder {
    constructor(modelName, attributes, defaults={}) {
      super(attributes, {});
      this.model = Model[modelName];
      this._useSave = '';
      if (! this.model) throw new Error('Model: "' + modelName + '" not found');
      Object.assign(this.defaults, this.model._defaults, defaults);
    }

    addPromise(p) {
      if (p instanceof Promise) {
        if (this[promises$] === void 0) {
          this[promises$] = [p];
        } else {
          this[promises$].push(p);
        }
      }

      return this;
    }

    afterPromises(func) {
      const p = this.waitPromises();
      if (p !== void 0) {
        this.addPromise(p.then(func));
      } else {
        func();
      }
      return this;
    }

    waitPromises() {
      const promises = this[promises$];
      if (promises !== void 0) {
        this[promises$] = void 0;
        return waitInSequence(promises).then(() => this.waitPromises());
      }
    }

    addRef(ref, doc) {
      this.afterPromises(() => {
        const refId = `${ref}_id`;
        if (! hasOwn(this.attributes, refId)) {
          const model = this.model.fieldTypeMap[refId];
          if (! model) throw new Error(
            `model not found for reference: ${refId} in model ${this.model.modelName}`);
          const {modelName} = model;
          if (typeof doc === 'function') {
            const p = doc(this);
            if (p instanceof Promise) {
              return this.addPromise(asyncAddRef(this, p, ref, refId, modelName));
            }
            doc = p;
          }
          if (doc === void 0) {
            doc = last[ref] ?? last[util.uncapitalize(modelName)];
          }
          if (doc == null) {
            const func = Factory['create' + util.capitalize(ref)] ?? Factory['create' + modelName];
            if (func === void 0) {
              throw new Error("can't find factory create for " + modelName);
            }
            const p = func();
            if (p instanceof Promise) {
              return this.addPromise(
                p.then((doc) => {this.defaults[refId] = doc._id === void 0 ? doc : doc._id}));
            } else {
              doc = p;
            }
          }
          this.defaults[refId] = doc._id === void 0 ? doc : doc._id;
        }
      });
      return this;
    }

    genName(field='name', prefix=this.model.modelName, space) {
      return this.addField(field, () => generateName(prefix, space));
    }

    genSeq(field, key) {
      return this.addField(field, () => generateSeq(key));
    }

    useSave(value) {
      this._useSave = value === 'force' ? value : (value ? 'assert' : '');
      return this;
    }

    insert() {
      const p = this.makeAttributes();
      if (p instanceof Promise) return asyncInsert(this, p);

      let id, doc;

      id = this.model._insertAttrs(p);
      if (id instanceof Promise) {
        doc = id.then((_id) => {
          id = _id;
          return this.model.findById(_id);
        });
      } else {
        doc = this.model.findById(id);
      }

      return (doc instanceof Promise)
        ? doc.then((doc) => insertNotify(this, doc, id))
        : insertNotify(this, doc, id);
    }

    build() {
      const doc = new this.model();
      let p = this.makeAttributes();
      if (p instanceof Promise) {
        return p.then((attrs) => {
          Object.assign(doc.changes, attrs);
          return doc;
        });
      }

      Object.assign(doc.changes, p);
      return doc;
    }

    create() {
      let doc;
      if (this._useSave !== '') {
        let p = this.makeAttributes();
        doc = this.model.build({});
        if (p instanceof Promise) {
          p = p.then((attrs) => {
            doc.changes = attrs;
            return doc.$save(this._useSave);
          });
        } else {
          doc.changes = p;
          p = doc.$save(this._useSave);
        }
        if (p instanceof Promise) {
          return p.then(() => asyncAfterCreate(this, doc));
        }
      } else {
        let p = this.insert();
        if (p instanceof Promise) {
          return p.then((doc) => asyncAfterCreate(this, doc));
        }
        doc = p;
      }

      this._afterCreate?.notify(doc, this);
      return doc;
    }

    afterCreate(func) {
      (this._afterCreate ?? (this._afterCreate = new Observable())).add(func);
      return this;
    }
  }

  const Factory = {
    startTransaction() {
      checkDb();
      tx.push([last, seqGen]);
      last = Object.assign({}, last);
      dbVars.seqGen = seqGen = Object.assign({}, seqGen);
    },

    endTransaction() {
      checkDb();
      if (tx.length === 0) {
        //        throw new Error('No transaction in progress!');
        return;
      }
      [last, seqGen] = tx.pop();
      dbVars.seqGen = seqGen;
      dbVars.last = last;
    },

    preserve(sym, docs) {
      for (let i = docs.length - 1; i >= 0; --i) {
        const doc = docs[i];
        doc[sym] = deepCopy(doc.attributes);
      }
    },

    restore(sym, docs) {
      for (let i = docs.length - 1; i >= 0; --i) {
        const doc = docs[i];
        doc.attributes = deepCopy(doc[sym]);
        doc.$reload();
      }
    },

    clearSym(sym, docs) {
      for (let i = docs.length - 1; i >= 0; --i) {
        delete docs[i][sym];
      }
    },

    clear() {
      checkDb();
      if (tx.length !== 0) {
        throw new Error('Transaction in progress!');
      }
      dbVars.last = last = {};
      dbVars.seqGen = seqGen = {};
    },

    get inTransaction() {
      checkDb();
      return tx.length != 0;
    },

    createList(number, creator, ...args) {
      checkDb();
      const list = [];

      const func = typeof args[0] === 'function' ? args.shift() : null;

      if (args.length === 0 || typeof args[args.length - 1] === 'string') {
        args.push({});
      }

      for (let i = 0; i < number; ++i) {
        func?.apply(args, [i, args[args.length - 1]]);
        list.push(this[creator].apply(this, args));
      }
      return list;
    },

    get last() {
      checkDb();
      return last;
    },

    setLastNow(now) {
      checkDb();
      lastNow = now;
    },

    lastOrCreate(name) {
      checkDb();
      return last[name] ?? Factory['create' + util.capitalize(name)]();
    },

    getUniqueNow,
    generateName,
    generateSeq,

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
      for (const key in models) {
        this['build' + key] = buildFunc(key, models[key]);
        this['create' + key] = createFunc(key, models[key]);
      }
      return this;
    },

    BaseBuilder,
    Builder,
  };

  const buildFunc = (key, def) => (...traitsAndAttributes) => {
    checkDb();
    return def.call(
      Factory, buildAttributes(key, traitsAndAttributes)).build();
  };

  const asyncCreate = async (p, key, traitsAndAttributes) => {
    const result = await p;
    if (postCreate[key] !== void 0) {
      return postCreate[key](result, key, traitsAndAttributes);
    } else {
      return last[key.substring(0, 1).toLowerCase() + key.substring(1)] = result;
    }
  };

  const createFunc = (key, def) => (...traitsAndAttributes) => {
    checkDb();
    const result = def.call(Factory, buildAttributes(key, traitsAndAttributes)).create();
    if (result instanceof Promise) {
      return asyncCreate(result, key, traitsAndAttributes);
    }

    if (postCreate[key] !== void 0) {
      return postCreate[key](result, key, traitsAndAttributes);
    } else {
      return last[key.substring(0, 1).toLowerCase() + key.substring(1)] = result;
    }
  };

  const buildAttributes = (key, args) => {
    const attributes = {}, keyTraits = traits[key] ?? {};
    for (let i = 0; i < args.length; ++i) {
      if (typeof args[i] === 'string') {
        const trait = keyTraits[args[i]];
        if (! trait) throw new Error('unknown trait "' + args[i] + '" for ' + key);
        Object.assign(attributes, typeof trait === 'function'
                      ? trait.call(keyTraits, attributes, args, i)
                      : trait);
      } else if (args[i]) {
        Object.assign(attributes, args[i]);
      }
    }
    return attributes;
  };

  return Factory;
});

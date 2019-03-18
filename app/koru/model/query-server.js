define((require)=>{
  const Changes         = require('koru/changes');
  const Model           = require('koru/model/map');
  const DocChange       = require('koru/model/doc-change');
  const Random          = require('koru/random');
  const koru            = require('../main');
  const util            = require('../util');
  const TransQueue      = require('./trans-queue');

  const {private$} = require('koru/symbols');
  const {makeDoc$} = Model[private$];

  const notNested = (db)=> db.inTransaction ? void 0 : db;

  return (Query, condition, notifyAC$)=>{

    const notify = (docChange)=>{
      Query[notifyAC$](docChange);
      docChange.model.notify(docChange);
    };

    util.merge(Query, {
      insert(doc) {
        const model = doc.constructor;
        TransQueue.transaction(notNested(model.db), ()=>{
          const result = model.docs.insert(doc.attributes, doc.attributes._id ? null : 'RETURNING _id');
          if (Array.isArray(result))
            doc.attributes._id = result[0]._id;

          model._$docCacheSet(doc);
          TransQueue.onAbort(() => model._$docCacheDelete(doc));
          const dc = DocChange.add(doc);
          Model._support.callAfterLocalChange(dc);
          TransQueue.onSuccess(()=>{notify(dc)});
        });
      },

      _insertAttrs(model, attrs) {
        if (! attrs._id && ! model.$fields._id.auto) attrs._id = Random.id();
        model.docs.insert(attrs);
      },
    });

    const applyCursorOptions = (query, cursor)=>{
      query._batchSize && cursor.batchSize(query._batchSize);
      query._limit && cursor.limit(query._limit);
      query._offset && cursor.offset(query._offset);
      query._sort && cursor.sort(query._sort);
    };

    util.merge(Query.prototype, {
      whereSql(...args) {
        (this._whereSqls || (this._whereSqls = [])).push(args);
        return this;
      },

      from({direction=1, values, order, excludeFirst=false}) {
        let qs = [];
        let fdir = 1, cmp = direction*fdir == 1 ? '>' : '<';
        order.forEach(field => {
          switch(field) {
          case 1: case -1:
            fdir = field;
            cmp = direction*fdir == 1 ? '>' : '<';
            break;
          default:
            const value = values[field];
            if (value === void 0) {
              qs.push(`("${field}" is not null or ("${field}" is null and`);
            } else {
              qs.push(`("${field}" ${cmp} {$${field}} or ("${field}" = {$${field}} and`);
            }
          }
        });
        if (excludeFirst)
          qs.push('false');
        else if (values._id === void 0 )
          qs.push('true');
        else
          qs.push(`_id ${cmp}= {$_id}`);

        this.whereSql(qs.join(' ')+qs.map(() => '').join('))'), values);
      },

      withIndex(idx, params, options) {
        if (this._sort) throw new Error('withIndex may not be used with sort');
        this.where(params).sort(...idx.sort);
        if (idx.filterTest !== void 0) this.where(idx.filterTest);
        this._index = idx;
        if (options !== void 0) {
          const {direction=1, from, to, excludeFrom=false, excludeTo=false} = options;
          if (direction === -1) this.reverseSort();
          if (from) {
            this.from({direction, values: from, order: idx.from,
                       excludeFirst: excludeFrom});
          }
          if (to) {
            this.from({direction: direction*-1, values: to, order: idx.from,
                       excludeFirst: excludeTo});
          }
        }

        return this;
      },

      offset(offset) {
        this._offset = offset;
        return this;
      },

      batchSize(size) {
        this._batchSize = size;
        return this;
      },

      fetch() {
        const results = [];
        this.forEach(doc => {results.push(doc)});
        return results;
      },

      waitForOne(timeout) {
        timeout = timeout || 2000;
        const query = this;
        const future = new util.Future;
        const handle = this.model.onChange(() => {
          const doc = query.fetchOne();
          if (doc) future.return(doc);
        });
        let timer;
        try {
          const doc = this.fetchOne();
          if (doc) return doc;
          timer = koru.setTimeout(() => {future.return()}, timeout);
          return future.wait();
        } finally {
          handle.stop();
          timer && koru.clearTimeout(timer);
        }
      },

      fetchIds() {
        if (this.singleId) throw Error('fetchIds onId not supported');

        const cursor = this.model.docs.find(this, {fields: {_id: 1}});
        applyCursorOptions(this, cursor);

        const results = [];
        try {
          for(let doc = cursor.next(); doc; doc = cursor.next()) {
            results.push(doc._id);
          }
        } finally {
          cursor.close();
        }
        return results;
      },

      show(func) {
        func(this.model.docs.show(this));
        return this;
      },

      forEach(func) {
        if (this.singleId) {
          const doc = this.fetchOne();
          doc && func(doc);
        } else {
          const hasFields = this._fields !== void 0;
          const {model} = this;
          const options = {};
          if (hasFields) options.fields = this._fields;
          const cursor = model.docs.find(this, options);
          try {
            applyCursorOptions(this, cursor);
            for (let rec = cursor.next(); rec !== void 0; rec = cursor.next()) {
              if (func(hasFields ? rec : model[makeDoc$](rec)) === true)
                break;
            }
          } finally {
            cursor.close();
          }

        }
        return this;
      },

      map(func) {
        const results = [];
        this.forEach(doc => {results.push(func(doc))});
        return results;
      },

      remove() {
        let count = 0;
        const {model} = this;
        const {docs} = model;
        const onSuccess = [];
        TransQueue.transaction(notNested(model.db), tran => {
          this.forEach(doc => {
            ++count;
            Model._support.callBeforeObserver('beforeRemove', doc);
            docs.remove({_id: doc._id});
            model._$docCacheDelete(doc);
            Model._support.callAfterLocalChange(DocChange.delete(doc));
            onSuccess.push(doc);
          });
          TransQueue.onSuccess(()=>{onSuccess.forEach(doc =>{notify(DocChange.delete(doc))})});
        });
        return count;
      },

      count(max) {
        if (max == null)
          return this.model.docs.count(this);
        else
          return this.model.docs.count(this, {limit: max});
      },

      exists() {
        return this.model.docs.exists(this);
      },

      update(changesOrField={}, value) {
        const origChanges = (typeof changesOrField === 'string')
                ? {[changesOrField]: value} : changesOrField;
        const {model, singleId} = this;
        Model._support._updateTimestamps(origChanges, model.updateTimestamps, util.newDate());

        let count = 0;
        let onSuccess = [], onAbort = [];

        TransQueue.transaction(notNested(model.db), tran => {
          const {docs} = model;
          TransQueue.onAbort(() => {
            onAbort.forEach(doc => model._$docCacheDelete(doc));
          });
          const where = {_id: ''};
          this.forEach(doc => {
            let fields;
            ++count;
            const attrs = doc.attributes;

            if (this._incs !== void 0) for (let field in this._incs) {
              origChanges[field] = attrs[field] + this._incs[field];
            }

            const params = Changes.topLevelChanges(attrs, origChanges);
            if (util.isObjEmpty(params)) return 0;
            docs.update({_id: doc._id}, params);
            const undo = Changes.applyAll(attrs, origChanges);

            if (! util.isObjEmpty(undo)) {
              onAbort.push(doc);
              model._$docCacheSet(doc);
              const dc = DocChange.change(doc, undo);
              Model._support.callAfterLocalChange(dc);
              onSuccess.push(dc);
            }
          });
          TransQueue.onSuccess(() => {
            onSuccess.forEach(notify);
          });
        });
        return count;
      },

      fetchOne() {
        let rec;
        const hasFields = this._fields !== void 0;
        if (this._sort && ! this.singleId) {
          const options = {limit: 1};
          if (this._sort) options.sort = this._sort;
          if (hasFields) options.fields = this._fields;
          let cursor = this.model.docs.find(this, options);
          try {
            rec = cursor.next();
          } finally {
            cursor.close();
          }
        } else {
          rec = this.model.docs.findOne(this, this._fields);
        }
        if (rec === void 0) return;
        return hasFields ? rec : this.model[makeDoc$](rec);
      },
    });

    Query.prototype[Symbol.iterator] = function *() {
        const hasFields = this._fields !== void 0;
      if (this.singleId) {
        const doc = this.fetchOne();
        doc && (yield doc);
      } else {
        const {model} = this;
        const options = {};
        if (hasFields) options.fields = this._fields;
        const cursor = model.docs.find(this, options);
        try {
          applyCursorOptions(this, cursor);
          for (let rec = cursor.next(); rec; rec = cursor.next()) {
            if ((yield hasFields ? rec : model[makeDoc$](rec)) === true)
              break;
          }
        } finally {
          cursor.close();
        }
      }
    };
  };
});

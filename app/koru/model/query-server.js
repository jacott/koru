define((require) => {
  'use strict';
  const Changes         = require('koru/changes');
  const Future          = require('koru/future');
  const DocChange       = require('koru/model/doc-change');
  const Model           = require('koru/model/map');
  const Random          = require('koru/random');
  const TransQueue      = require('./trans-queue');
  const koru            = require('../main');
  const util            = require('../util');

  const {private$} = require('koru/symbols');
  const {makeDoc$} = Model[private$];

  return (Query, condition, notifyAC$) => {
    const notify = async (docChange) => {
      await Query[notifyAC$](docChange);
      await docChange.model.notify(docChange);
    };

    util.merge(Query, {
      async insert(doc) {
        const model = doc.constructor;
        await TransQueue.nonNested(model.db, async () => {
          const result = await model.docs.insert(doc.attributes, doc.attributes._id ? undefined : 'RETURNING _id');
          if (Array.isArray(result)) {
            doc.attributes._id = result[0]._id;
          }

          model._$docCacheSet(doc);
          TransQueue.onAbort(() => model._$docCacheDelete(doc));
          const dc = DocChange.add(doc);
          await Model._support.callAfterLocalChange(dc);
          await TransQueue.onSuccess(async () => {await notify(dc)});
        });
      },

      async _insertAttrs(model, attrs) {
        if (! attrs._id && ! model.$fields._id.auto) attrs._id = Random.id();
        await model.docs.insert(attrs);
      },
    });

    const applyCursorOptions = (query, cursor) => {
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
        let fdir = 1, cmp = direction * fdir == 1 ? '>' : '<';
        order.forEach((field) => {
          switch (field) {
          case 1: case -1:
            fdir = field;
            cmp = direction * fdir == 1 ? '>' : '<';
            break;
          default:
            const value = values[field];
            if (value === undefined) {
              qs.push(`("${field}" is not null or ("${field}" is null and`);
            } else {
              qs.push(`("${field}" ${cmp} {$${field}} or ("${field}" = {$${field}} and`);
            }
          }
        });
        if (excludeFirst) {
          qs.push('false');
        } else if (values._id === undefined) {
          qs.push('true');
        } else {
          qs.push(`_id ${cmp}= {$_id}`);
        }

        this.whereSql(qs.join(' ') + qs.map(() => '').join('))'), values);
      },

      withIndex(idx, params, options) {
        if (this._sort) throw new Error('withIndex may not be used with sort');
        this.where(params).sort(...idx.sort);
        if (idx.filterTest !== undefined) this.where(idx.filterTest);
        this._index = idx;
        if (options !== undefined) {
          const {direction=1, from, to, excludeFrom=false, excludeTo=false} = options;
          if (direction === -1) this.reverseSort();
          if (from) {
            this.from({direction, values: from, order: idx.from,
                       excludeFirst: excludeFrom});
          }
          if (to) {
            this.from({direction: direction * -1, values: to, order: idx.from,
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

      async fetch() {
        const results = [];
        await this.forEach((doc) => {results.push(doc)});
        return results;
      },

      async waitForOne(timeout=2000) {
        const query = this;
        const future = new Future();
        const handle = this.model.onChange(async () => {
          const doc = await query.fetchOne();
          if (doc !== undefined) future.resolve(doc);
        });
        let timer;
        try {
          const doc = await this.fetchOne();
          if (doc) return doc;
          timer = koru.setTimeout(future.resolve, timeout);
          return await future.promise;
        } finally {
          handle.stop();
          timer && koru.clearTimeout(timer);
        }
      },

      async fetchIds() {
        if (this.singleId) throw Error('fetchIds onId not supported');

        const cursor = this.model.docs.find(this, {fields: {_id: 1}});
        applyCursorOptions(this, cursor);

        const results = [];
        try {
          for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
            results.push(doc._id);
          }
        } finally {
          await cursor.close();
        }
        return results;
      },

      show(func) {
        func(this.model.docs.show(this));
        return this;
      },

      async forEach(func) {
        if (this.singleId) {
          const doc = await this.fetchOne();
          doc && (await func(doc));
        } else {
          const hasFields = this._fields !== undefined;
          const {model} = this;
          const options = {};
          if (hasFields) options.fields = this._fields;
          const cursor = model.docs.find(this, options);
          try {
            applyCursorOptions(this, cursor);
            for (let rec = await cursor.next(); rec !== undefined; rec = await cursor.next()) {
              if ((await func(hasFields ? rec : model[makeDoc$](rec))) === true) {
                break;
              }
            }
          } finally {
            await cursor.close();
          }
        }
        return this;
      },

      async map(func) {
        const results = [];
        await this.forEach((doc) => {results.push(func(doc))});
        return results;
      },

      async remove() {
        let count = 0;
        const {model} = this;
        const {docs} = model;
        const onSuccess = [];
        await TransQueue.nonNested(model.db, async (tran) => {
          await this.forEach(async (doc) => {
            ++count;
            await Model._support.callBeforeObserver('beforeRemove', doc);
            await docs.remove({_id: doc._id});
            model._$docCacheDelete(doc);
            await Model._support.callAfterLocalChange(DocChange.delete(doc));
            onSuccess.push(doc);
          });
          TransQueue.onSuccess(() => {onSuccess.forEach((doc) => notify(DocChange.delete(doc)))});
        });
        return count;
      },

      async count(max) {
        if (max == null) {
          return await this.model.docs.count(this);
        } else {
          return await this.model.docs.count(this, {limit: max});
        }
      },

      exists() {return this.model.docs.exists(this)},

      notExists() {return this.model.docs.notExists(this)},

      async update(changesOrField={}, value) {
        const origChanges = (typeof changesOrField === 'string')
              ? {[changesOrField]: value}
              : changesOrField;
        const {model, singleId} = this;
        Model._support._updateTimestamps(origChanges, model.updateTimestamps, util.newDate());

        let count = 0;
        let onSuccess = [], onAbort = [];

        await TransQueue.nonNested(model.db, async (tran) => {
          const {docs} = model;
          TransQueue.onAbort(() => {
            onAbort.forEach((doc) => model._$docCacheDelete(doc));
          });
          const where = {_id: ''};
          await this.forEach(async (doc) => {
            let fields;
            ++count;
            const attrs = doc.attributes;

            if (this._incs !== undefined) for (let field in this._incs) {
              origChanges[field] = attrs[field] + this._incs[field];
            }

            const params = Changes.topLevelChanges(attrs, origChanges);
            if (util.isObjEmpty(params)) return 0;
            await docs.update({_id: doc._id}, params);
            const undo = Changes.applyAll(attrs, origChanges);

            if (! util.isObjEmpty(undo)) {
              onAbort.push(doc);
              model._$docCacheSet(doc);
              const dc = DocChange.change(doc, undo);
              await Model._support.callAfterLocalChange(dc);
              onSuccess.push(dc);
            }
          });
          await TransQueue.onSuccess(async () => {
            for (const change of onSuccess) {
              await notify(change);
            }
          });
        });
        return count;
      },

      async fetchOne() {
        let rec;
        const hasFields = this._fields !== undefined;
        if (this._sort && ! this.singleId) {
          const options = {limit: 1};
          if (this._sort) options.sort = this._sort;
          if (hasFields) options.fields = this._fields;
          let cursor = this.model.docs.find(this, options);
          try {
            rec = await cursor.next();
          } finally {
            await cursor.close();
          }
        } else {
          rec = await this.model.docs.findOne(this, this._fields);
        }
        if (rec === undefined) return;
        return hasFields ? rec : this.model[makeDoc$](rec);
      },
    });

    Query.prototype[Symbol.asyncIterator] = async function *() {
      if (this.singleId) {
        const doc = await this.fetchOne();
        doc && (yield doc);
      } else {
        const hasFields = this._fields !== undefined;
        const {model} = this;
        const options = {};
        if (hasFields) options.fields = this._fields;
        const cursor = model.docs.find(this, options);
        try {
          applyCursorOptions(this, cursor);
          for (let rec = await cursor.next(); rec !== undefined; rec = await cursor.next()) {
            if (await (yield (hasFields ? rec : model[makeDoc$](rec))) === true) {
              break;
            }
          }
        } finally {
          await cursor.close();
        }
      }
    }
  };
});

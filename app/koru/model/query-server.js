define(function(require, exports, module) {
  const Changes    = require('koru/changes');
  const Model      = require('koru/model/map');
  const Random     = require('koru/random');
  const koru       = require('../main');
  const util       = require('../util');
  const TransQueue = require('./trans-queue');
  const Future     = requirejs.nodeRequire('fibers/future');

  return function (Query, condition, notifyAC$) {
    function notify(model, now, was) {
      Query[notifyAC$](now, was);
      model.notify(now, was);
    }

    util.merge(Query, {
      insert(doc) {
        const model = doc.constructor;
        const result = model.docs.insert(doc.attributes, doc.attributes._id ? null : 'RETURNING _id');
        if (Array.isArray(result))
          doc.attributes._id = result[0]._id;

        model._$docCacheSet(doc.attributes);
        TransQueue.onAbort(() => model._$docCacheDelete(doc));
        Model._support.callAfterObserver(doc, null);
        TransQueue.onSuccess(() => notify(model, doc, null));
      },

      _insertAttrs(model, attrs) {
        if (! attrs._id && ! model.$fields._id.auto) attrs._id = Random.id();
        model.docs.insert(attrs);
        model._$docCacheSet(attrs);
      },
    });

    util.merge(Query.prototype, {
      where(params, value) {
        return condition(this, '_wheres', params, value);
      },

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
            if (value === undefined) {
              qs.push(`("${field}" is not null or ("${field}" is null and`);
            } else {
              qs.push(`("${field}" ${cmp} {$${field}} or ("${field}" = {$${field}} and`);
            }
          }
        });
        if (excludeFirst)
          qs.push('false');
        else if (values._id === undefined )
          qs.push('true');
        else
          qs.push(`_id ${cmp}= {$_id}`);

        this.whereSql(qs.join(' ')+qs.map(() => '').join('))'), values);
      },

      withIndex(idx, params, options) {
        if (this._sort) throw new Error('withIndex may not be used with sort');
        this.where(params).sort(...idx.sort);
        if (options !== undefined) {
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

      limit(limit) {
        this._limit = limit;
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
        const future = new Future;
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
        const where = this._wheres;
        if (this.singleId) {
          const doc = this.fetchOne();
          doc && func(doc);
        } else {
          const {model} = this;
          const options = {};
          if (this._fields) options.fields = this._fields;
          const cursor = model.docs.find(this, options);
          try {
            applyCursorOptions(this, cursor);
            for (let doc = cursor.next(); doc; doc = cursor.next()) {
              if (func(new model(doc)) === true)
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
        TransQueue.transaction(model.db, tran => {
          this.forEach(doc => {
            ++count;
            Model._support.callBeforeObserver('beforeRemove', doc);
            docs.remove({_id: doc._id});
            model._$docCacheDelete(doc);
            Model._support.callAfterObserver(null, doc);
            onSuccess.push(doc);
          });
        });
        TransQueue.onSuccess(() => {
          onSuccess.forEach(doc => notify(model, null, doc));
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

      update(origChanges, value) {
        if (typeof origChanges === 'string') {
          const changes = {};
          changes[origChanges] = value;
          origChanges = changes;
        } else
          origChanges = origChanges || {};

        const model = this.model;
        const docs = model.docs;
        let items = null;

        const cmd = buildUpdate(this, origChanges);

        let count = 0;
        let onSuccess = [], onAbort = [];
        TransQueue.transaction(model.db, tran => {
          TransQueue.onAbort(() => {
            onAbort.forEach(doc => model._$docCacheDelete(doc));
          });
          this.forEach(doc => {
            let fields, dups;
            let changes = util.deepCopy(origChanges);
            ++count;
            const attrs = doc.attributes;

            if (this._incs !== undefined) for (let field in this._incs) {
              changes[field] = attrs[field] + this._incs[field];
            }

            Changes.applyAll(attrs, changes);

            let itemCount = 0;

            if (items = this._addItems) {
              fields = {};
              let atLeast1 = false;
              for(let field in items) {
                let list = attrs[field] || (attrs[field] = []);
                util.forEach(items[field], item => {
                  if (util.addItem(list, item) == null) {
                    atLeast1 = true;
                    changes[field + ".$-" + ++itemCount] = item;
                  }
                });
                if (atLeast1) fields[field] = {$each: items[field]};
              }
              if (atLeast1)
                cmd.$addToSet = fields;
            }

            if (items = this._removeItems) {
              const pulls = {};
              dups = {};
              for(let field in items) {
                const matches = [];
                let match, list = attrs[field];
                util.forEach(items[field], item => {
                  if (list && (match = util.removeItem(list, item)) !== undefined) {
                    changes[field + ".$+" + ++itemCount] = match;
                    matches.push(match);
                  }
                });
                if (matches.length) {
                  let upd = matches.length === 1 ? matches[0] : {$in: matches};
                  if (fields && fields.hasOwnProperty(field))
                    dups[field] = upd;
                  else
                    pulls[field] = upd;
                }
              }
              for (let field in pulls) {
                cmd.$pull = pulls;
                break;
              }
            }

            if (util.isObjEmpty(cmd)) return 0;

            docs.koruUpdate(doc, cmd, dups);

            model._$docCacheSet(doc.attributes);
            onAbort.push(doc);
            Model._support.callAfterObserver(doc, changes);
            onSuccess.push([doc, changes]);
          });
        });
        TransQueue.onSuccess(() => {
          onSuccess.forEach(([doc, changes]) => notify(model, doc, changes));
        });
        return count;
      },

      fetchOne() {
        let opts, doc;
        if (this._sort && ! this.singleId) {
          const options = {limit: 1};
          if (this._sort) options.sort = this._sort;
          if (this._fields) options.fields = this._fields;
          let cursor = this.model.docs.find(this, options);
          try {
            doc = cursor.next();
          } finally {
            cursor.close();
          }
        } else {
          if (this._fields) opts = this._fields;
          doc = this.model.docs.findOne(this, opts);
        }
        if (! doc) return;
        return new this.model(doc);
      },
    });

    Query.prototype[Symbol.iterator] = function *() {
      if (this.singleId) {
        const doc = this.fetchOne();
        doc && (yield doc);
      } else {
        const {model} = this;
        const options = {};
        if (this._fields) options.fields = this._fields;
        const cursor = model.docs.find(this, options);
        try {
          applyCursorOptions(this, cursor);
          for (let doc = cursor.next(); doc; doc = cursor.next()) {
            if ((yield new model(doc)) === true)
              break;
          }
        } finally {
          cursor.close();
        }
      }
    };
  };

  function applyCursorOptions(query, cursor) {
    query._batchSize && cursor.batchSize(query._batchSize);
    query._limit && cursor.limit(query._limit);
    query._sort && cursor.sort(query._sort);
  }

  function buildUpdate(query, changes) {
    const cmd = {};

    if (query._incs !== undefined) cmd.$inc = query._incs;

    let set, unset;
    for(let field in changes) {
      const value = changes[field];
      if (value === undefined)
        (unset = unset || {})[field] = '';
      else
        (set = set || {})[field] = value;
    }

    if (set) cmd.$set = set;
    if (unset) cmd.$unset = unset;

    return cmd;
  }
});

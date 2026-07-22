define((require, exports, module) => {
  'use strict';
  const Model           = require('koru/model');
  const BaseModel       = require('koru/model/base-model');
  const PgError         = require('koru/pg/pg-error');
  const PgPrepSql       = require('koru/pg/pg-prep-sql');
  const SQLStatement    = require('koru/pg/sql-statement');

  const table$ = Symbol(), ps$ = Symbol();

  const {private$} = require('koru/symbols');

  const {makeDoc$} = Model[private$];

  let portalName = 0;

  const RAW = {raw: true, cache: false};
  const DEFAULT = {raw: false, cache: false};

  const conn = (q) => {
    const table = q.model.docs;
    if (q[table$] !== table) {
      q[table$] = table;
      q[ps$] = undefined;
    }
    return q.model.db.existingTran?.conn;
  };

  const auto = async (model) => (await model.db.startAutoEndTran()).conn;

  const basicMapper = (model, opts) => {
    if (opts.raw) {
      return (rec) => rec;
    }
    return opts.cache ? (rec) => model[makeDoc$](rec) : (rec) => new model(rec);
  };

  const recordMapper = (model, opts, type) => {
    if (type === undefined) return basicMapper(model, opts);

    if (typeof type === 'function') {
      const callback = type;
      if (opts.raw) {
        return callback;
      }
      return opts.cache
        ? (rec) => callback(model[makeDoc$](rec))
        : (rec) => callback(new model(rec));
    }

    const list = type;
    if (opts.raw) {
      return (rec) => (list.push(rec), true);
    }
    return opts.cache
      ? (rec) => (list.push(model[makeDoc$](rec)), true)
      : (rec) => (list.push(new model(rec)), true);
  };

  const toSQLStatement = (model, fields, queryStr) => {
    if (typeof queryStr !== 'string') return queryStr;

    if (
      /^[\s(]*(?:select|with|update|delete|insert|values|merge|create|alter|drop)\b/i.test(queryStr)
    ) {
      return new SQLStatement(queryStr);
    }

    const whereRegex = /^[\s]*where\b/i;
    if (!whereRegex.test(queryStr)) {
      queryStr = 'WHERE ' + queryStr;
    }

    return new SQLStatement(`SELECT ${fields} FROM "${model.modelName}" ${queryStr}`);
  };

  class SqlQuery {
    constructor(model, queryStr, options = DEFAULT) {
      this.model = model;
      this.queryStr = toSQLStatement(model, options.fields ?? '*', queryStr);
      this[ps$] = undefined;
      this[table$] = undefined;
      this.raw = options.raw ?? false;
      this.cache = options.cache ?? false;
    }

    async #initPs() {
      const table = this[table$];
      table._ready !== true && await table._ensureTable();

      const ps = new PgPrepSql(this.queryStr.text);

      const argOids = this.queryStr.argOids();
      const argMap = this.queryStr.argMap();

      ps.setParamMapper(
        argMap.length,
        argOids == null
          ? (obj, callback) => {
            for (const name of argMap) {
              callback(obj[name]);
            }
          }
          : (obj, callback) => {
            let i = 0;
            for (const name of argMap) {
              callback(obj[name], argOids[i++]);
            }
          },
      );
      return ps;
    }

    async #fetchOneRec(params) {
      const c = conn(this) ?? await auto(this.model);
      return (this[ps$] ??= await this.#initPs()).fetchOne(c, params);
    }

    async execute(params) {
      const c = conn(this) ?? await auto(this.model);
      return (this[ps$] ??= await this.#initPs()).execute(c, params);
    }

    async fetchOne(params, options) {
      const {model} = this;
      const rec = await this.#fetchOneRec(params);
      return rec === undefined ? undefined : basicMapper(model, options ?? this)(rec);
    }

    async fetch(params, options) {
      const {model} = this;
      const c = conn(this) ?? await auto(model);
      const ps = (this[ps$] ??= await this.#initPs());
      const port = ps.portal(c, '', params);
      const rows = [];
      const err = await port.fetch(
        ps._readyQuery(c, port, recordMapper(model, options ?? this, rows)),
      );
      if (err !== undefined) {
        throw (err instanceof Error) ? err : new PgError(err, ps.queryStr, params);
      }
      return rows;
    }

    async mapField(field, params) {
      const rows = [];
      await this.forEach(params, (rec) => {
        rows.push(rec[field]);
      }, RAW);
      return rows;
    }

    async forEach(params, callback, options) {
      const {model} = this;
      const c = conn(this) ?? await auto(model);
      const ps = (this[ps$] ??= await this.#initPs());
      const port = ps.portal(c, '', params);
      const limit = options?.limit;
      const err = await port.fetch(
        ps._readyQuery(c, port, recordMapper(model, options ?? this, callback)),
        limit,
      );
      if (err !== undefined) {
        throw (err instanceof Error) ? err : new PgError(err, ps.queryStr, params);
      }
    }

    async *values(params, options) {
      const {model} = this;
      const c = conn(this) ?? await auto(model);
      const ps = (this[ps$] ??= await this.#initPs());
      const name = 'p' + (++portalName).toString(36);

      const port = ps.portal(c, name, params);

      const rows = [];

      const callback = ps._readyQuery(c, port, recordMapper(model, options ?? this, rows));
      const limit = options?.limit ?? 50;

      while (true) {
        const err = await port.fetch(callback, limit);
        if (err !== undefined) {
          throw (err instanceof Error) ? err : new PgError(err, ps.queryStr, params);
        }

        if (rows.length === 0) {
          return;
        }
        for (const row of rows) {
          yield await row;
        }
        if (!port.isMore) {
          return;
        }

        rows.length = 0;
      }
    }

    async value(params, defValue) {
      const rec = await this.#fetchOneRec(params);
      for (const name in rec) return rec[name];
      return defValue;
    }

    async fetchOneField(field, params, defValue) {
      return (await this.#fetchOneRec(params))?.[field] ?? defValue;
    }

    async exists(params) {
      const rec = await this.#fetchOneRec(params);
      return rec === undefined ? false : true;
    }
  }

  BaseModel.sqlWhere = function (queryStr, fields) {
    return new SqlQuery(this, queryStr, fields);
  };

  BaseModel.sql = BaseModel.sqlWhere;

  return SqlQuery;
});

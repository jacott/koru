define((require, exports, module) => {
  'use strict';
  const Future          = require('koru/future');
  const Model           = require('koru/model');
  const BaseModel       = require('koru/model/base-model');
  const PgError         = require('koru/pg/pg-error');
  const PgPrepSql       = require('koru/pg/pg-prep-sql');

  const {private$} = require('koru/symbols');

  const {makeDoc$} = Model[private$];

  const conn = (model) => model.db.existingTran?.conn;
  const auto = async (model) => (await model.db.startAutoEndTran()).conn;

  class SqlQuery {
    #pgsql = void 0;
    constructor(model, queryStr) {
      this.queryStr = queryStr;
      this.model = model;
    }

    async #initPs() {
      const parts = this.queryStr.split(/\{\$(\w+)\}/);
      const posMap = {}, nameMap = [];
      const last = parts.length - 1;
      let text = `SELECT * FROM "${this.model.modelName}" WHERE`;
      for (let i = 0; i < last; i += 2) {
        const name = parts[i + 1];
        text += parts[i] + '$' + (posMap[name] ??= (nameMap.push(name), nameMap.length));
      }

      const table = this.model.docs;

      table._ready !== true && await table._ensureTable();
      const ps = new PgPrepSql(text + parts[last]);

      ps.setMapped(nameMap, table._colMap);
      return ps;
    };

    async fetchOne(params) {
      const {model} = this;
      const rec = await (this.#pgsql ??= await this.#initPs()).fetchOne(conn(model) ?? await auto(model), params);
      return rec === void 0 ? rec : model[makeDoc$](rec);
    }

    async fetch(params) {
      const {model} = this;
      const c = conn(model) ?? await auto(model);
      const ps = (this.#pgsql ??= await this.#initPs());
      const port = ps.portal(c, '', params);
      const rows = [];
      const err = await port.fetch(ps._readyQuery(c, port, (rec) => {rows.push(model[makeDoc$](rec))}));
      if (err !== void 0) throw (err instanceof Error) ? err : new PgError(err, this.queryStr, params);
      return rows;
    }

    async forEach(params, callback) {
      const {model} = this;
      const c = conn(model) ?? await auto(model);
      const ps = (this.#pgsql ??= await this.#initPs());
      const port = ps.portal(c, '', params);
      const err = await port.fetch(ps._readyQuery(c, port, (rec) => {callback(model[makeDoc$](rec))}));
      if (err !== void 0) throw (err instanceof Error) ? err : new PgError(err, this.queryStr, params);
    }

    async *values(params) {
      const {model} = this;
      const c = conn(model) ?? await auto(model);
      const ps = (this.#pgsql ??= await this.#initPs());
      const port = ps.portal(c, '', params);
      const rows = [];
      let promise, resolve;
      const setPromise = () => promise = new Promise((r) => {resolve = r});

      setPromise();

      const pv = c.conn[private$];

      const future = new Future();
      const errp = port.fetch(ps._readyQuery(c, port, (rec) => (resolve(rec), rec === void 0)));
      errp.then(() => resolve());
      while (true) {
        const rec = await promise;
        setPromise();
        if (rec === void 0) {
          const err = await errp;
          if (err !== void 0) throw (err instanceof Error) ? err : new PgError(err, this.queryStr, params);
          return;
        }
        yield model[makeDoc$](rec);
        pv.sendNext();
      }
    }

    async value(params, defValue) {
      const rec = (await this.fetchOne(params));
      for (const name in rec) return rec[name];
      return defValue;
    }
  }

  BaseModel.sqlWhere = function (queryStr) {return new SqlQuery(this, queryStr)}

  return SqlQuery;
});

define((require, exports, module) => {
  'use strict';
  const Model           = require('koru/model');
  const BaseModel       = require('koru/model/base-model');
  const PgError         = require('koru/pg/pg-error');
  const PgPrepSql       = require('koru/pg/pg-prep-sql');

  const {private$} = require('koru/symbols');

  const {makeDoc$} = Model[private$];

  const conn = (model) => model.db.existingTran?.conn;
  const auto = async (model) => (await model.db.startAutoEndTran()).conn;

  class SqlQuery {
    #pgsql = undefined;
    constructor(model, queryStr, fields='*') {
      this.queryStr = queryStr;
      this.model = model;
      this.fields = fields;
    }

    async #initPs() {
      const parts = this.queryStr.split(/\{\$(\w+)\}/);
      const posMap = {}, nameMap = [];
      const last = parts.length - 1;
      let text = `SELECT ${this.fields} FROM "${this.model.modelName}" WHERE `;
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

    async #fetchOneRec(params) {
      return (this.#pgsql ??= await this.#initPs()).fetchOne(conn(this.model) ?? await auto(this.model), params);
    };

    async fetchOne(params) {
      const {model} = this;
      const rec = await this.#fetchOneRec(params);
      return rec === undefined ? rec : model[makeDoc$](rec);
    }

    async fetch(params) {
      const {model} = this;
      const c = conn(model) ?? await auto(model);
      const ps = (this.#pgsql ??= await this.#initPs());
      const port = ps.portal(c, '', params);
      const rows = [];
      const err = await port.fetch(ps._readyQuery(c, port, (rec) => {rows.push(model[makeDoc$](rec))}));
      if (err !== undefined) throw (err instanceof Error) ? err : new PgError(err, ps.queryStr, params);
      return rows;
    }

    async forEach(params, callback) {
      const {model} = this;
      const c = conn(model) ?? await auto(model);
      const ps = (this.#pgsql ??= await this.#initPs());
      const port = ps.portal(c, '', params);
      const err = await port.fetch(ps._readyQuery(c, port, (rec) => {callback(model[makeDoc$](rec))}));
      if (err !== undefined) throw (err instanceof Error) ? err : new PgError(err, ps.queryStr, params);
    }

    async *values(params) {
      const {model} = this;
      const c = conn(model) ?? await auto(model);
      const ps = (this.#pgsql ??= await this.#initPs());

      const port = ps.portal(c, '', params);
      let promise, resolve;
      const setPromise = () => promise = new Promise((r) => {resolve = r});

      setPromise();

      const pv = c.conn[private$];

      const errp = port.fetch(ps._readyQuery(c, port, (rec) => (resolve(rec), rec === undefined)));
      errp.then(() => resolve());
      while (true) {
        const rec = await promise;
        setPromise();
        if (rec === undefined) {
          const err = await errp;
          if (err !== undefined) throw (err instanceof Error) ? err : new PgError(err, ps.queryStr, params);
          return;
        }
        yield model[makeDoc$](rec);
        pv.sendNext();
      }
    }

    async value(params, defValue) {
      const rec = await this.#fetchOneRec(params);
      for (const name in rec) return rec[name];
      return defValue;
    }

    async exists(params) {
      const rec = await this.#fetchOneRec(params);
      return rec === undefined ? false : true;
    }
  }

  BaseModel.sqlWhere = function (queryStr, fields) {return new SqlQuery(this, queryStr, fields)}

  return SqlQuery;
});

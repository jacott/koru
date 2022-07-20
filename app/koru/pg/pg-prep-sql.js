define((require, exports, module) => {
  'use strict';
  const PgError         = require('koru/pg/pg-error');
  const {getRow, forEachColumn, buildNameOidColumns, buildColumns} = require('koru/pg/pg-util');
  const util            = require('koru/util');

  const {private$} = require('koru/symbols');

  let nameCounter = 0;

  const tagToCount = (tag='') => {
    const ridx = tag.lastIndexOf(' ');
    return ridx == -1 ? tag : +tag.slice(ridx + 1);
  };

  class PgCursor {
    constructor(client, pname, portal, ps) {
      this.name = pname;
      const pv = this[private$] = {
        portal, getValue: client.buildGetValue(), columns: ps.columns,
        excludeNulls: client.formatOptions.excludeNulls ?? true};
      if (ps.columns === void 0) portal.describe(
        (rawColumns) => {pv.columns = ps.columns = buildNameOidColumns(rawColumns)});
    }

    async fetch(maxRows=0) {
      const pv = this[private$];
      let {portal, getValue, excludeNulls} = pv;
      if (! portal[private$].canFetch) return;
      const rows = [];
      const err = await portal.fetch(
        (rawRow) => {rows.push(getRow(pv.columns, getValue, rawRow, excludeNulls))}, maxRows);
      if (err !== void 0) {
        throw (err instanceof Error) ? err : new PgError(err, portal.u8query?.uf8Slice());
      }
      return rows;
    }

    close(err) {return this[private$].portal.close(err)}
  }

  class PgPrepSql {
    #paramCount = 0;
    #paramMapper = void 0;
    columns = void 0;
    #conns = new WeakSet();

    constructor(queryStr, name) {
      this.queryStr = queryStr;
      this.psName = name ?? `koru_${(++nameCounter).toString(26)}`;
    }

    setParamMapper(paramCount, mapper) {
      this.#paramCount = paramCount;
      this.#paramMapper = mapper;
      return this;
    }

    setMapped(names, colMap) {
      this.#paramCount = names.length;
      this.#paramMapper = (obj, callback) => {
        for (let i = 0; i < names.length; ++i) {
          const name = names[i];
          callback(obj[name], colMap[name]?.oid);
        }
      };
      return this;
    }

    setOids(oids) {
      if (oids === void 0) return this;
      this.#paramCount = oids.length;
      this.#paramMapper = (obj, callback) => {for (let i = 0; i < oids.length; ++i) callback(obj[i], oids[i])};
      return this;
    }

    async fetchOne(client, ...args) {
      const port = this.#buildQuery(client, '', ...args);
      let rec;
      const err = await port.fetch(this.#readyQuery(client, port, (r) => {rec ??= r}));
      if (err !== void 0) {
        throw (err instanceof Error) ? err : new PgError(err, this.queryStr, args);
      }
      if (port.isMore) await port.close();
      return rec;
    }

    async fetch(client, ...args) {
      const port = this.#buildQuery(client, '', ...args);
      const rows = [];
      const err = await port.fetch(this.#readyQuery(client, port, (rec) => {rows.push(rec)}));
      if (err !== void 0) throw (err instanceof Error) ? err : new PgError(err, this.queryStr, args);
      return rows;
    }

    async execute(client, ...args) {
      const port = this.#buildQuery(client, '', ...args);
      let tag; port.commandComplete((t) => {tag = t});
      const rows = [];
      const err = await port.fetch(this.#readyQuery(client, port, (rec) => {rows.push(rec)}));
      if (err !== void 0) throw (err instanceof Error) ? err : new PgError(err, this.queryStr, args);
      return rows.length == 0 && ! tag.startsWith('SELECT ') ? tagToCount(tag) : rows;
    }

    openCursor(client, pname, ...args) {
      const portal = this.#buildQuery(client, pname, ...args);
      return new PgCursor(client, pname, portal, this);
    }

    async describe(client, fields, ...args) {
      const {excludeNulls=true} = client.formatOptions;
      const port = this.#buildQuery(client, '', ...args);
      let {columns} = this;
      const err = await port.describe((rawColumns) => {columns = this.columns = buildColumns(rawColumns, fields)}, true);
      if (err !== void 0) {
        throw (err instanceof Error) ? err : new PgError(err, this.queryStr, args);
      }
      return columns;
    }

    #readyQuery(client, port, callback) {
      const {excludeNulls=true} = client.formatOptions;
      let {columns} = this;
      if (columns === void 0) port.describe((rawColumns) => {columns = this.columns = buildNameOidColumns(rawColumns)});

      const getValue = client.buildGetValue();
      return (rawRow) => {callback(getRow(columns, getValue, rawRow, excludeNulls))};
    };

    #buildQuery(client, pname, ...args) {
      const {types: {encodeBinary, guessOid}} = client;
      const {psName, oids} = this;
      const {conn} = client;
      const isCached = this.#conns.has(conn);
      const port = conn.portal(pname);

      let b;
      if (isCached) {
        b = port.bindNamed(psName, this.#paramCount);
      } else {
        if (psName !== '') this.#conns.add(conn);
        port.parse(psName, this.queryStr, this.#paramCount);
        b = port.prepareValues();
      }
      let index = -1;
      const pm = this.#paramMapper;
      if (pm !== void 0) {
        const encoder = (value, oid=0) => {port.addParamOid(encodeBinary(b, value, oid == 0 ? guessOid(value) : oid))};
        for (const obj of args) index = pm(obj, encoder, index);
      }
      return port;
    };
  }

  if (isTest) PgPrepSql[isTest] = {
    reset: () => {
      nameCounter = 0;
    },
  };

  return PgPrepSql;
});

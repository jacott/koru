define((require, exports, module) => {
  'use strict';
  const PgError         = require('koru/pg/pg-error');
  const {getRow, forEachColumn, buildNameOidColumns, buildColumns} = require('koru/pg/pg-util');
  const util            = require('koru/util');

  let nameCounter = 0;

  const tagToCount = (tag) => {
    const ridx = tag.lastIndexOf(' ');
    return ridx == -1 ? tag : +tag.slice(ridx + 1);
  };

  class PgPrepSql {
    #paramMap = [];
    oids = [];
    columns = void 0;
    #posMap = void 0;
    #conns = new WeakSet();

    constructor(queryStr, name) {
      this.queryStr = queryStr;
      this.psName = name ?? `koru_${(++nameCounter).toString(26)}`;
    }

    addMap(params, colMap) {
      const posMap = this.#posMap ??= {};
      const {oids} = this;
      for (const name in params) {
        this.#paramMap.push(name);
        posMap[name] = oids.length;
        oids.push(colMap[name]?.oid ?? 0);
      }
      return this;
    }

    addOids(oids) {
      for (const n of oids) {
        this.#paramMap.push(void 0);
        this.oids.push(n);
      }
      return this;
    }

    async fetchOne(client, ...args) {
      const {excludeNulls=true} = client.formatOptions;
      let {columns} = this;
      let rec;
      const port = this.#buildQuery(client, args);
      if (columns === void 0) port.describe((rawColumns) => {columns = this.columns = buildNameOidColumns(rawColumns)});

      const getValue = client.buildGetValue();
      const err = await port.fetch((rawRow) => {
        rec ??= getRow(columns, getValue, rawRow, excludeNulls);
      }, 2);
      if (err !== void 0) {
        throw (err instanceof Error) ? err : new PgError(err, this.queryStr, args);
      }
      if (port.isMore) await port.close();
      return rec;
    }

    async execute(client, ...args) {
      const {excludeNulls=true} = client.formatOptions;
      let {columns} = this;
      let rec;
      const port = this.#buildQuery(client, args);
      if (columns === void 0) port.describe((rawColumns) => {columns = this.columns = buildNameOidColumns(rawColumns)});

      const rows = [];
      const getValue = client.buildGetValue();
      const err = await port.fetch((rawRow) => {
        rows.push(getRow(columns, getValue, rawRow, excludeNulls));
      });
      if (err !== void 0) {
        throw (err instanceof Error) ? err : new PgError(err, this.queryStr, args);
      }
      if (port.isMore) await port.close();
      return rows.length == 0 ? tagToCount(port.getCompleted()) : rows;
    }

    async describe(client, fields, ...args) {
      const {excludeNulls=true} = client.formatOptions;
      let rec;
      const port = this.#buildQuery(client, args);
      let {columns} = this;
      const err = await port.describe((rawColumns) => {columns = this.columns = buildColumns(rawColumns, fields)}, true);
      if (err !== void 0) {
        throw (err instanceof Error) ? err : new PgError(err, this.queryStr, args);
      }
      return columns;
    }

    #buildQuery(client, args) {
      const {types: {encodeBinary, guessOid}} = client;

      const {psName, oids} = this;

      const {conn} = client;

      const isCached = this.#conns.has(conn);

      const port = conn.portal();
      let b;
      if (isCached) {
        b = port.bindNamed(psName, oids.length);
      } else {
        if (psName !== '') this.#conns.add(conn);
        port.parse(psName, this.queryStr, oids.length);
        b = port.prepareValues();
      }
      let index = -1;
      for (const obj of args) {
        if (Array.isArray(obj)) {
          for (let i = 0; i < obj.length; ++i) {
            const oid = oids[++index];
            const value = obj[i];
            port.addParamOid(encodeBinary(b, value, oid == 0 ? guessOid(value) : oid));
          }
        } else {
          for (const _ in obj) {
            const oid = oids[++index];
            const value = obj[this.#paramMap[index]];
            port.addParamOid(encodeBinary(b, value, oid == 0 ? guessOid(value) : oid));
          }
        }
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

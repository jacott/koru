define((require, exports, module) => {
  'use strict';
  const PgPrepSql       = require('koru/pg/pg-prep-sql');

  class PsSql {
    #ps = undefined;
    #_table = undefined;
    constructor(queryStr, model) {
      this.queryStr = queryStr;
      this.model = model;
    }

    #table() {
      const table = this.model.docs ?? this.model;
      if (table !== this.#_table) {
        this.#ps = undefined;
        this.#_table = table;
      }
      return table;
    }

    async #initPs() {
      const parts = this.queryStr.split(/\{\$(\w+)\}/);
      const posMap = {}, nameMap = [];
      const last = parts.length - 1;
      let text = '';
      for (let i = 0; i < last; i += 2) {
        const name = parts[i + 1];
        text += parts[i] + '$' + (posMap[name] ??= (nameMap.push(name), nameMap.length));
      }
      this.#_table._ready !== true && await this.#_table._ensureTable();

      const ps = new PgPrepSql(text + parts[last]);

      ps.setMapped(nameMap, this.#_table._colMap);
      return ps;
    }

    fetchOne(params) {
      return this.#table().withConn(async (conn) =>
        (this.#ps ??= await this.#initPs()).fetchOne(conn, params)
      );
    }

    fetch(params) {
      return this.#table().withConn(async (conn) =>
        (this.#ps ??= await this.#initPs()).fetch(conn, params)
      );
    }

    execute(params) {
      return this.#table().withConn(async (conn) =>
        (this.#ps ??= await this.#initPs()).execute(conn, params)
      );
    }

    async value(params, defValue) {
      const rec = await this.fetchOne(params);
      for (const name in rec) return rec[name];
      return defValue;
    }

    async exists(params, defValue) {
      const rec = await this.fetchOne(params);
      return rec === undefined ? false : true;
    }

    openCursor(pname, ...args) {
      const callback = args.pop();
      return this.#table().withConn(async (conn) => {
        const cursor = (this.#ps ??= await this.#initPs()).openCursor(conn, pname, ...args);
        return callback(cursor);
      });
    }
  }

  return PsSql;
});

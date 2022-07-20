define((require, exports, module) => {
  'use strict';

  const PgPrepSql       = require('koru/pg/pg-prep-sql');

  class PsSql {
    #pgsql = void 0;
    constructor(queryStr, model) {
      this.queryStr = queryStr;
      this.table = model.docs ?? model;
    }

    #initPs() {
      const parts = this.queryStr.split(/\{\$(\w+)\}/);
      const posMap = {}, nameMap = [];
      const last = parts.length - 1;
      let text = '';
      for (let i = 0; i < last; i += 2) {
        const name = parts[i + 1];
        text += parts[i] + '$' + (posMap[name] ??= (nameMap.push(name), nameMap.length));
      }
      const ps = new PgPrepSql(text + parts[last]);

      ps.setMapped(nameMap, this.table._colMap);
      return ps;
    };

    fetchOne(params) {return this.table.withConn((conn) => (this.#pgsql ??= this.#initPs()).fetchOne(conn, params))}

    fetch(params) {return this.table.withConn((conn) => (this.#pgsql ??= this.#initPs()).fetch(conn, params))}

    async value(params, defValue) {
      const rec = (await this.fetchOne(params));
      for (const name in rec) return rec[name];
      return defValue;
    }
  }

  return PsSql;
});

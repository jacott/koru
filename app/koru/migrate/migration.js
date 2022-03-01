const fsp = require('fs/promises');
const Path = require('path');

define((require, exports, module) => {
  'use strict';
  const Enumerable      = require('koru/enumerable');
  const ModelMap        = require('koru/model/map');
  const koru            = require('../main');
  const util            = require('../util');

  const actions$ = Symbol();

  class Commander {
    constructor() {
      this[actions$] = [];
    }

    createTable(name, fields, indexes) {
      const args = {};
      if (typeof name === 'object') {
        Object.assign(args, name);
      } else {
        args.name = name;
        args.fields = fields;
        args.indexes = indexes;
      }
      this[actions$].push({action: createTable, args});
    }

    reversible({add, revert, resetTables}) {
      this[actions$].push({action: reversible, args: {add, revert, resetTables}});
    }

    addColumns(tableName, ...args) {
      this[actions$].push({action: addColumns, args: {tableName, args}});
    }

    addIndex(tableName, spec) {
      this[actions$].push({action: addIndex, args: {tableName, args: spec}});
    }
  }

  const createTable = async (add, client, {name, fields, unlogged, indexes, primaryKey=true}) => {
    if (Array.isArray(fields)) {
      fields = buildFields(fields);
    }
    if (add) {
      const list = primaryKey ? ['_id text collate "C" PRIMARY KEY'] : [];
      for (const col in fields) {
        const colspec = client.jsFieldToPg(col, fields[col]);
        if (/\bprimary key\b/i.test(colspec)) {
          list[0] = colspec;
        } else {
          list.push(colspec);
        }
      }

      await client.query(`CREATE${unlogged ? ' UNLOGGED' : ''} TABLE "${name}" (${list.join(',')})`);
      if (indexes) {
        for (const args of indexes) await addIndex(true, client, {tableName: name, args});
      }
    } else {
      await client.query(`DROP TABLE IF EXISTS "${name}"`);
    }
    resetTable(name);
  };

  const reversible = async (add, client, options) => {
    if (add && options.add) {
      await options.add(client);
    }
    if (! add && options.revert) {
      await options.revert(client);
    }
    util.forEach(options.resetTables, (name) => resetTable(name));
  };

  const addIndex = async (add, client, {tableName, args}) => {
    let i = 0;
    const isArray = Array.isArray(args);
    const unique = isArray ? args[0] === '*unique' : !! args.unique;
    const columns = isArray
          ? (unique ? args.slice(1) : args)
          : args.columns;
    const iname = args.name ||
          tableName + '_' + columns.map((field) => field.replace(/\s.*$/, '')).join('_');
    if (add) {
      const order = columns.map((field) => field.replace(/(^\S+)/, '"$1"')).join(',');
      const where = args.where ? `where ${args.where}` : '';
      await client.query(
        `${unique ? 'CREATE UNIQUE' : 'CREATE'} INDEX "${iname}" ON "${tableName}"
USING btree (${order}) ${where}`);
    } else {
      await client.query(`DROP INDEX "${iname}"`);
    }
  };

  const buildFields = (args) => {
    const fields = {};
    args.forEach((arg) => {
      if (typeof arg === 'string') {
        const k = arg.split(':', 1)[0];
        fields[k] = arg.slice(k.length + 1) || 'text';
      } else {
        Object.assign(fields, arg);
      }
    });
    return fields;
  };

  const addColumns = async (add, client, {tableName, args}) => {
    const fields = buildFields(args);
    if (add) {
      await client.query(`ALTER TABLE "${tableName}"
${Object.keys(fields).map((col) => `ADD column ${client.jsFieldToPg(col, fields[col])}`).join(',')}`);
    } else {
      await client.query(`ALTER TABLE "${tableName}" ${
                         Object.keys(fields).map((col) => `DROP column "${col}"`).join(',')}`);
    }
    resetTable(tableName);
  };

  const resetTable = (tableName) => {
    const model = ModelMap[tableName];
    model && model.docs._resetTable();
  };

  const onlyMigrateFiles = (fn) => /\d.*.js$/.test(fn);

  const readMigration = async (mig) => {
    const id = mig + '.js';
    try {
      return await new Promise((resolve, reject) => {require([id], resolve)});
    } finally {
      koru.unload(id);
    }
  };

  class Migration {
    constructor(client) {
      this._client = client;
    }

    async addMigration(name, callback) {
      await this._doMigration(true, name, callback);
    }

    async revertMigration(name, callback) {
      await this._doMigration(false, name, callback);
    }

    async recordAllMigrations(dirPath) {
      const filenames = (await fsp.readdir(dirPath)).filter(onlyMigrateFiles).sort();

      const migrations = await this._getMigrations();

      for (let i = 0; i < filenames.length; ++i) {
        const row = filenames[i].replace(/\.js$/, '');
        if (! migrations[row]) {
          await this._client.query('INSERT INTO "Migration" VALUES ($1)', [row]);
          this._migrations[row] = true;
        }
      }
    }

    async migrateTo(dirPath, pos, verbose) {
      if (! dirPath || ! pos) throw new Error('Please specifiy where to migrate to');
      const filenames = (await fsp.readdir(dirPath)).filter(onlyMigrateFiles).sort();

      const migrations = await this._getMigrations();

      for (let i = 0; i < filenames.length; ++i) {
        const row = filenames[i].replace(/\.js$/, '');
        if (row > pos) {
          break;
        }
        if (! migrations[row]) {
          verbose && console.log('Adding ' + row);
          await this.addMigration(row, await readMigration(dirPath + '/' + row));
        }
      }
      for (const row of Enumerable.reverseValues(Object.keys(migrations).sort())) {
        if (row > pos) {
          verbose && console.log('Reverting ' + row);
          await this.revertMigration(row, await readMigration(dirPath + '/' + row));
        }
      }
    }

    async migrationExists(name) {
      return !! (await this._getMigrations())[name];
    }

    async _getMigrations() {
      if (this._migrations) return this._migrations;
      await this._client.query('CREATE TABLE IF NOT EXISTS "Migration" (name text PRIMARY KEY)');
      this._migrations = Object.create(null);
      (await this._client.query('SELECT name FROM "Migration"')).
        forEach((row) => this._migrations[row.name] = true);
      return this._migrations;
    }

    async _doMigration(add, name, callback) {
      const client = this._client;
      await client.transaction(async (tx) => {
        if ((await this.migrationExists(name)) === add) return;

        const mc = new Commander();
        {const p = callback(mc); if (p instanceof Promise) await p}
        if (add) {
          for (const {action, args} of mc[actions$]) {
            await action(add, client, args);
          }
          await client.query('INSERT INTO "Migration" VALUES ($1)', [name]);
          this._migrations[name] = true;
        } else {
          for (const {action, args} of Enumerable.reverseValues(mc[actions$])) {
            await action(add, client, args);
          }
          await client.query('DELETE FROM "Migration" WHERE name=$1', [name]);
          delete this._migrations[name];
        }
      });
    }
  }

  if (isTest) {
    Migration[isTest] = {Commander};
  }

  return Migration;
});

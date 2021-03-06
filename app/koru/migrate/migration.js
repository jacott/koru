const Future = requirejs.nodeRequire('fibers/future'), wait = Future.wait;
const fs = require('fs');
const Path = require('path');
const readdir = Future.wrap(fs.readdir);
const stat = Future.wrap(fs.stat);

define((require, exports, module)=>{
  'use strict';
  const ModelMap = require('koru/model/map');
  const koru     = require('../main');
  const util     = require('../util');

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

  const createTable = (add, client, {name, fields, unlogged, indexes, primaryKey=true}) => {
    if (Array.isArray(fields))
      fields = buildFields(fields);
    if (add) {
      const list = primaryKey ? ['_id text collate "C" PRIMARY KEY'] : [];
      for (const col in fields) {
        const colspec = client.jsFieldToPg(col, fields[col]);
        if (/\bprimary key\b/i.test(colspec))
          list[0] = colspec;
        else
          list.push(colspec);
      }

      client.query(`CREATE${unlogged ? ' UNLOGGED' : ''} TABLE "${name}" (${list.join(',')})`);
      if (indexes) {
        for (const args of indexes) addIndex(true, client, {tableName: name, args});
      }
    } else {
      client.query(`DROP TABLE IF EXISTS "${name}"`);
    }
    resetTable(name);
  };

  const reversible = (add, client, options)=>{
    if (add && options.add)
      options.add(client);
    if (! add && options.revert)
      options.revert(client);
    util.forEach(options.resetTables, name => resetTable(name));
  };

  const addIndex = (add, client, {tableName, args})=>{
    let i = 0;
    const isArray = Array.isArray(args);
    const unique = isArray ? args[0] === '*unique' : !! args.unique;
    const columns = isArray ?
            (unique ? args.slice(1) : args)
          : args.columns;
    const iname = args.name ||
            tableName+'_'+columns.map(field => field.replace(/\s.*$/, '')).join('_');
    if (add) {
      const order = columns.map(field => field.replace(/(^\S+)/, '"$1"')).join(',');
      const where = args.where ? `where ${args.where}` : '';
      client.query(
        `${unique ? 'CREATE UNIQUE' : 'CREATE'} INDEX "${iname}" ON "${tableName}"
USING btree (${order}) ${where}`);
    } else {
      client.query(`DROP INDEX "${iname}"`);
    }
  };

  const buildFields = args=>{
    const fields = {};
    args.forEach(arg => {
      if (typeof arg === 'string') {
        const k = arg.split(':', 1)[0];
        fields[k] = arg.slice(k.length+1)|| 'text';
      } else
        Object.assign(fields, arg);
    });
    return fields;
  };

  const addColumns = (add, client, {tableName, args})=>{
    const fields = buildFields(args);
    if (add) {
      client.query(`ALTER TABLE "${tableName}" ${
Object.keys(fields).map(col => `ADD column ${client.jsFieldToPg(col, fields[col])}`).join(",")
}`);
    } else {
      client.query(`ALTER TABLE "${tableName}" ${
Object.keys(fields).map(col => `DROP column "${col}"`).join(",")
}`);
    }
    resetTable(tableName);
  };

  const resetTable = tableName => {
    const model = ModelMap[tableName];
    model && model.docs._resetTable();
  };

  const onlyMigrateFiles = fn => /\d.*.js$/.test(fn);

  const readMigration = mig =>{
    const future = new Future;
    const id = mig+'.js';
    try {
      require([id], mig =>{
        future.return(mig);
      });
      return future.wait();
    } finally {
      koru.unload(id);
    }
  };

  class Migration {
    constructor(client) {
      this._client = client;
    }

    addMigration(name, callback) {
      this._doMigration(true, name, callback);
    }

    revertMigration(name, callback) {
      this._doMigration(false, name, callback);
    }

    recordAllMigrations(dirPath) {
      const filenames = readdir(dirPath).wait().filter(onlyMigrateFiles).sort();

      const migrations = this._getMigrations();

      for(let i = 0; i < filenames.length; ++i) {
        const row = filenames[i].replace(/\.js$/,'');
        if (! migrations[row]) {
          this._client.query('INSERT INTO "Migration" VALUES ($1)', [row]);
          this._migrations[row] = true;
        }
      }
    }

    migrateTo(dirPath, pos, verbose) {
      if (! dirPath || ! pos) throw new Error("Please specifiy where to migrate to");
      const filenames = readdir(dirPath).wait().filter(onlyMigrateFiles).sort();

      const migrations = this._getMigrations();

      for(let i = 0; i < filenames.length; ++i) {
        const row = filenames[i].replace(/\.js$/,'');
        if (row > pos)
          break;
        if (! migrations[row]) {
          verbose && console.log("Adding " + row);
          this.addMigration(row, readMigration(dirPath+'/'+row));
        }
      }
      util.reverseForEach(Object.keys(migrations).sort(), row => {
        if (row > pos) {
          verbose && console.log("Reverting " + row);
          this.revertMigration(row, readMigration(dirPath+'/'+row));
        }
      });
    }

    migrationExists(name) {
      return !! this._getMigrations()[name];
    }

    _getMigrations() {
      if (this._migrations) return this._migrations;
      this._client.query('CREATE TABLE IF NOT EXISTS "Migration" (name text PRIMARY KEY)');
      this._migrations = Object.create(null);
      this._client.query('SELECT name FROM "Migration"').
        forEach(row => this._migrations[row.name] = true);
      return this._migrations;
    }

    _doMigration(add, name, callback) {
      const client = this._client;
      client.transaction(tx => {
        if (this.migrationExists(name) === add) return;

        const mc = new Commander();
        callback(mc);
        if (add) {
          mc[actions$].forEach(({action, args}) => {action(add, client, args)});
          client.query('INSERT INTO "Migration" VALUES ($1)', [name]);
          this._migrations[name] = true;
        } else {
          mc[actions$].reverse().forEach(({action, args}) => {action(add, client, args)});
          client.query('DELETE FROM "Migration" WHERE name=$1', [name]);
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

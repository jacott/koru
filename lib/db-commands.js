#!/usr/bin/env node
// -*- js2 -*-
const path = require('path');
const fs = require('fs');
const commander = require('commander');
const {topDir, system, loadEnv} = require('./script-utils');

module.exports = function (program) {
  program.command('db-schema-dump')
    .option('--dir <DB_DIR>', 'save the schema in SCRIPTS directory. Defaults to db')
    .description(
      `dump the current demo schema to disk and reset test db`
    )
    .action(action(dbSchemaDump));

  program.command('db-reset-test')
    .option('--schema <FILE>', 'the schema to load. Defaults to db/schema.sql')
    .description(`reset the test database schema`)
    .action(action(dbResetTest));

  common(program.command('db-migrate [VERSION]'))
    .option('--dir <SCRIPTS>', 'find the scripts under SCRIPTS. Defaults to db/migrate')
    .description(
      `Apply migration scripts to the database.

If no VERSION is given apply all unapplied scripts. Otherwise run
scripts (up or down) to get to VERSION`
    )
    .action(action(dbMigrate));

  program.parse(process.argv);

  if (program) {
    if (process.argv[2])
      console.error("Invalid db command: "+process.argv[2]);
    else
      program.outputHelp();
    process.exit(1);
  }

  function action(func) {
    return function () {
      program = null;
      const env = this.env||'demo';
      if (env !== process.env.KORU_ENV) {
        loadEnv(env);
      }
      return func.apply(this, arguments);
    };
  }
};

function common(program) {
  return program
    .option('-e, --env <NAME>', 'run command in environment NAME. Defaults to demo');
}

function dbSchemaDump(options) {
  const env = process.env;
  const schema = system('pg_dump', '--no-acl', '-O', '-s', env.KORU_APP_NAME+'demo')
          .toString().replace(/\s+$/g, '');
  const schemaName = topDir(options.dir||'db')+'/schema.sql';
  fs.writeFileSync(schemaName, schema);
  resetSchema(schemaName, env.KORU_APP_NAME+'test');
}

function dbResetTest(options) {
  resetSchema(options.schema||topDir(options.dir||'db')+'/schema.sql',
              process.env.KORU_APP_NAME+'test');
}

function resetSchema(schemaName, dbName) {
  system(process.env.SHELL || '/bin/sh', '-c',
         `dropdb --if-exists ${dbName} && createdb ${dbName} && psql -q ${dbName} <${schemaName}`);
}

function dbMigrate(VERSION, options) {
  const cfg = require('./build-conf')(options.env, topDir('.'));
  const yaajs = require('yaajs');
  const Fiber = require('fibers');

  global.requirejs = yaajs;
  global.requirejs.nodeRequire = require;

  Error.stackTraceLimit = 50;

  const server = cfg.server;

  yaajs.config(server.requirejs);

  Fiber(function () {
    const deps = ['koru/main', 'koru/migrate/migration', 'koru/config!DBDriver',
                  ...(server.extraRequires||[])];
    var func;
    yaajs(deps, function (koru, Migration, DBDriver) {
      func = function () {
        new Migration(DBDriver.defaultDb).migrateTo(
          options.dir || topDir('db/migrate'),
          VERSION || 'z',
          'verbose'
        );
      };
    });
    func();
    process.exit(0);
  }).run();
}
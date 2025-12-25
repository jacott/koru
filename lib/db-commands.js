#!/usr/bin/env node
// -*- js2 -*-
const path = require('path');
const fs = require('fs');
const {topDir, system, loadEnv, withKoru} = require('./script-utils');

const common = (program) => program
      .option('-e, --env <NAME>', 'run command in environment NAME. Defaults to demo');

const dbSchemaDump = (options) => {
  const env = process.env;
  let schema = system('pg_dump', '--no-acl', '-O', '-s', env.KORU_APP_NAME + 'demo')
      .toString();
  schema = '--\n' + schema.slice(schema.indexOf('-- Name: '))
      .replace(/\s+$/g, '').replace(/[\n\r]+\\unrestrict\s[\s\S]*$/, '');
  const schemaName = topDir(options.dir || 'db') + '/schema.sql';
  fs.writeFileSync(schemaName, schema);
  resetSchema(schemaName, env.KORU_APP_NAME + 'test');
};

const dbResetTest = (options) => {
  resetSchema(options.schema || topDir(options.dir || 'db') + '/schema.sql',
    process.env.KORU_APP_NAME + 'test');
};

const resetSchema = (schemaName, dbName) => {
  const customReset = topDir('scripts/reset-test-db');
  if (fs.existsSync(customReset)) {
    system(customReset, dbName, schemaName);
  } else {
    system(process.env.SHELL || '/bin/sh', '-c',
      `dropdb --if-exists ${dbName} && createdb ${dbName} &&
      if [ -e "${schemaName}" ];then psql -q ${dbName} <${schemaName};fi`);
  }
};

const dbMigrate = (VERSION, options) => withKoru(options, ({cfg, server}) => {
  const deps = [
    'koru/main', 'koru/migrate/migration', 'koru/config!DBDriver',
  ];

  const dir = options.dir || topDir('db/migrate'),
  setup = path.join(dir, 'setup.js');

  if (fs.existsSync(setup)) {
    deps.push(setup);
  }

  return new Promise((resolve, reject) => {
    requirejs(deps, (
      koru, Migration, DBDriver, setup,
    ) => {
      const db = setup ? setup.db : DBDriver.defaultDb;

      new Migration(db).migrateTo(dir, VERSION || '~', 'verbose').then(resolve, reject);
    });
  });
});

module.exports = (program, help) => {
  const action = (func) => async function (...args) {
    try {
      program = null;
      const {env='demo'} = this;
      if (env !== process.env.KORU_ENV) {
        loadEnv(env);
      }
      await func.apply(this, args);
    } catch (err) {
      console.error(err.stack);
      process.exit(1);
    }
  }

  program.command('db-schema-dump')
    .option('--dir <DB_DIR>', 'save the schema in SCRIPTS directory. Defaults to db')
    .description(
      `dump the current demo schema to disk and reset test db`,
    )
    .action(action(dbSchemaDump));

  program.command('db-reset-test')
    .option('--schema <FILE>', 'the schema to load. Defaults to db/schema.sql')
    .description(`reset the test database schema`)
    .action(action(dbResetTest));

  common(program.command('db-migrate [VERSION]'))
    .option('--dir <SCRIPTS>', 'find the scripts under SCRIPTS. Defaults to db/migrate')
    .description('Apply migration scripts to the database. If no VERSION is given apply all unapplied scripts. Otherwise run scripts (up or down) to get to VERSION',
    )
    .action(action(dbMigrate));

  if (help !== undefined) {
    return;
  }

  program.parse(process.argv);

  if (program) {
    program.outputHelp();
    process.exit(1);
  }
};

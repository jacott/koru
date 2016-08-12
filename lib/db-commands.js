#!/usr/bin/env node
// -*- js2 -*-
const path = require('path');
const fs = require('fs');
const commander = require('commander');
const {topDir, system, loadEnv} = require('./script-utils');

module.exports = function (program) {
  common(program.command('db-migrate [VERSION]'))
    .option('--dir=SCRIPTS', 'find the scripts under SCRIPTS. Defaults to db/migrate')
    .description(
      `Apply migration scripts to the database.

If no VERSION is given apply all unapplied scripts. Otherwise run
scripts (up or down) to get to VERSION`
    )
    .action(action(dbMigrate));

  program.parse(process.argv);

  program && program.help();

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
    .option('-e, --env <NAME>', 'run command in environment <NAME>. Defaults to demo');
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

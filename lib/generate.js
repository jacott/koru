#!/usr/bin/env node
// -*- js2 -*-
const path = require('path');
const fs = require('fs');
const commander = require('commander');
let program = new commander.Command;

module.exports = function () {
  let args = program.normalize(process.argv);
  if (args.length === 3) {
    help(args);

    listGenerators();

    return;
  }

  for(let i = 3; i < args.length; ++i) {
    const arg = args[i];
    if (arg[0] !== '-') {
      subCommand(arg, args);
      return;
    }

    if (arg === '-h' || arg === '--help') {
      help(args);
      return;
    }
  }

  help(args);
};

function subCommand(command, args) {
  const sp = new commander.Command;
  defaultOpts(sp);
  sp.on('generate', outputHelpIfNecessary);
  sp.on('g', outputHelpIfNecessary);
  console.log('DEBUG args', args);
  require('../lib/generators/'+command).call(this, sp, args);

  function outputHelpIfNecessary(args, unknown) {
    sp.parseArgs([], unknown);
  }
}

function defaultOpts(cmd) {
  return cmd.option('-p, --pretend', 'Run but do not make any changes');
}

function help(args) {
  program
    .usage('generate [GENERATOR] [args]')
    .description(`create things in you project. Running koru generate by itself gives a list of available generators`)
    .allowUnknownOption(true);

  defaultOpts(program);

  program.parse(args);

  program.outputHelp();
}

function listGenerators() {
  console.log('Please choose a generator below:\n\n');
  fs.readdirSync(path.resolve(__dirname, './generators')).forEach(file => {
    console.log('  '+file.slice(0, -3));
  });
}

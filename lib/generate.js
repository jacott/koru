#!/usr/bin/env node
// -*- js2 -*-
const path = require('path');
const fs = require('fs');
const {Command} = require('commander');
const program = new Command();

function subCommand(command, args) {
  const sp = new Command();
  defaultOpts(sp);

  const outputHelpIfNecessary = (args, unknown) => {
    sp.parseArgs([], unknown);
  };
  sp.on('generate', outputHelpIfNecessary);
  sp.on('g', outputHelpIfNecessary);
  try {
    require('./generators/' + command).call(this, sp, args.slice(2));
  } catch (ex) {
    if (/Cannot find module/.test(ex.message)) {
      help(args);
    } else {
      throw ex;
    }
  }
}

const defaultOpts = (cmd) => cmd.option('-p, --pretend', 'Run but do not make any changes')
  .option('--force', 'overwrite existing files');

const help = (args) => {
  program
    .usage('generate [GENERATOR] <args...>')
    .description(`Create things in your project.`)
    .argument('<args...>')
    .allowUnknownOption(true);

  defaultOpts(program);

  program.parse(args);

  program.outputHelp();

  console.log('\nPlease choose a generator below:\n');
  fs.readdirSync(path.resolve(__dirname, './generators')).forEach((file) => {
    console.log('  ' + file.slice(0, -3));
  });
};

module.exports = () => {
  let args = process.argv;

  if (args.length < 3) {
    help(args);

    return;
  }

  for (let i = 3; i < args.length; ++i) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help' || arg === 'help') {
      help(args);
      return;
    }
    if (arg[0] !== '-') {
      subCommand(arg, args);
      return;
    }
  }

  help(args);
};

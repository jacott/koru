const path = require('path');
const fs = require('fs');
const {template, fileizeString, classifyString, camelizeString,
       mkdir_p,
       skelDir, topDir} = require('../script-utils');

module.exports = function (program, args) {
  program
    .usage('generate migration <name> [columns...]')
    .description(`create a database migration script.  If the migration name is of the
for add-xxx-to-yyy or remove-xxx-from-yyy and is followed a list of
column-name:column-type then migration containing the appropriate
add column and remove column statements will be created.`);

  program.parse(args);

  let [name, ...columns] = args.slice(4);


  if (! name)
    program.help();

  name = fileizeString(name);

  const now = new Date;
  const scriptName = `${now.toISOString().replace(/:/g, '-').replace(/\..*$/, '')}-${name}.js`;

  const ar = /^(add|remove)-(.*)-(?:to|from)-(.*)$/.exec(name);
  const tFile = (columns.length && ar ? `migrate-${ar[1]}` : 'migrate')+'.js';

  mkdir_p(topDir('db/migrate'));

  const dest = 'db/migrate/'+scriptName;

  console.log('  create '+dest);

  template(skelDir(tFile), topDir(dest), {
    tableName() {return JSON.stringify(classifyString(ar[3]))},
    addColumns() {
      return columns.map(col => JSON.stringify(camelizeString(col))).join(", ");
    },

    removeColumns() {
      return columns.map(col => JSON.stringify(camelizeString(col.split(':')[0]))).join(", ");
    },
  });
};

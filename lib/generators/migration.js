const path = require('path');
const fs = require('fs');
const {template, fileizeString, classifyString, camelizeString,
  mkdir_p,
  skelDir, topDir} = require('../script-utils');

module.exports = function (program, args) {
  program
    .usage('generate migration <name> <columns...>')
    .description(`create a database migration script.  If the migration name is of the
    form add-xxx-to-yyy or remove-xxx-from-yyy and is followed a list of
    column-name:column-type then migration containing the appropriate
    add column and remove column statements will be created.`)
    .argument('<name>')
    .argument('<columns...>')
    .action((name, columns) => {
      name = fileizeString(name);

      const now = new Date();
      const scriptName = `${now.toISOString().replace(/:/g, '-').replace(/\..*$/, '')}-${name}.js`;

      const ar = /^(add|remove)-(.*)-(?:to|from)-(.*)$/.exec(name);
      const cr = ar == null ? /^create-(.*)$/.exec(name) : null;
      const tFile = (columns.length && ar != null
        ? `migrate-${ar[1]}`
        : (cr == null
          ? 'migrate'
          : 'migrate-create')) + '.js';

      mkdir_p(topDir('db/migrate'));

      const dest = 'db/migrate/' + scriptName;

      template(skelDir(tFile), topDir(dest), {
        tableName() {return JSON.stringify(classifyString(ar != null ? ar[3] : cr[1]))},
        addColumns() {
          return columns.map((col) => JSON.stringify(camelizeString(col))).join(', ');
        },

        removeColumns() {
          return columns.map((col) => JSON.stringify(camelizeString(col.split(':')[0]))).join(', ');
        },
      });
    });
  program.parse(args);
}

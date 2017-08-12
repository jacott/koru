const modelUtil = require('../model-util');
const {
  fileizeString, skelDir,
} = require('../script-utils');

module.exports = function (program, args) {
  program
    .usage('generate model <name> [fields...]')
    .description(`create a model with the specified fields.  Fields are of the form:
<name:type>; type defaults to text.`);

  program.parse(args);

  let [name, ...columns] = program.args.slice(2);

  if (! name)
    program.help();

  name = fileizeString(name);
  const newModelSkel = skelDir('newModel')+'/';

  modelUtil.createModel(name, columns, newModelSkel, program);

};

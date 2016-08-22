const modelUtil = require('../model-util');
const {
  fileizeString, skelDir,
} = require('../script-utils');

module.exports = function (program, args) {
  program
    .usage('generate publish <name> [modelName]')
    .description(`create a publish module named <name> for model <modelName>.
<modelName> defaults to <name>`);

  program.parse(args);

  let [name, modelName=name] = program.args.slice(1);

  if (! name)
    program.help();

  name = fileizeString(name);
  modelName = fileizeString(modelName);
  const newPublishSkel = skelDir('newPublish')+'/';

  modelUtil.createPublish(name, modelName, newPublishSkel, program);
};

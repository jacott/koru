const modelUtil = require('../model-util');
const {
  fileizeString, skelDir,
} = require('../script-utils');

module.exports = function (program, args) {
  program
    .usage('generate publish <name> [modelName]')
    .description(`create a publish module named <name> for model <modelName>.
    <modelName> defaults to <name>`)
    .argument('<name>')
    .argument('[modelName]')
    .action((name, modelName) => {
      name = fileizeString(name);
      modelName = fileizeString(modelName);
      const newPublishSkel = skelDir('newPubsub') + '/';

      modelUtil.createPublish(name, modelName, newPublishSkel, program);
    });

  program.parse(args);
}

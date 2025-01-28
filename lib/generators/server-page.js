const spUtil = require('../sp-util');
const {
  fileizeString, skelDir,
} = require('../script-utils');

module.exports = function (program, args) {
  program
    .usage('generate server-page <name>')
    .description(`create a server-page.`)
    .argument('<name>')
    .action((name) => {
      name = fileizeString(name);
      const newServerPageSkel = skelDir('newServerPage') + '/';

      spUtil.createPage(name, newServerPageSkel, program);
    });
  program.parse(args);
}

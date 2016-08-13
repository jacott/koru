const path = require('path');
const fs = require('fs');
const {templateString, fileizeString, classifyString, camelizeString,
       mkdir_p, findFiles, pathExists, findStartOfLine,
       skelDir, topDir} = require('../script-utils');

module.exports = function (program, args) {
  program
    .usage('generate model <name> [fields...]')
    .description(`create a model with the specified fields.  Fields are of the form:
<name:type>; type defaults to text.`);

  program.parse(args);

  let [name, ...columns] = program.args.slice(1);

  if (! name)
    program.help();

  name = fileizeString(name);
  const modelName = classifyString(name);
  const newModelSkel = skelDir('newModel')+'/';

  const modelFn = `app/models/${name}.js`;
  if (pathExists(modelFn))
    throw new Error(`Model file ${modelFn} already exists!`);

  // create model
  mkdir_p(topDir('app/models'));
  writeMapped(modelFn, mapped('model'));
  writeMapped(`app/models/${name}-test.js`, mapped('model-test'));

  // create migration
  const now = new Date;
  const scriptName = `${now.toISOString().replace(/:/g, '-').replace(/\..*$/, '')}-create-${name}.js`;
  mkdir_p(topDir('db/migrate'));
  writeMapped('db/migrate/'+scriptName, mapped('migrate-create-model'));

  const factoryFn = 'app/test/factory.js';
  const factoryExits = pathExists(factoryFn);
  if (! factoryExits) {
    writeMapped(factoryFn, fs.readFileSync(newModelSkel+'factory.js'));
  }

  if (factoryExits || ! program.pretend) {
    console.log('  modify '+factoryFn);
    const genName = (columns.find(col => /^name(:|$)/.test(col))) ?
            '.genName()' : '';

    const factoryCode = fs.readFileSync(factoryFn).toString()
            .replace(/([^\S\n\r]*)(\/\/\$\$newModel\$\$)/, (m, pre, suf) => {
              return pre+
                `${modelName}(options) {
${pre}  return new Factory.Builder('${modelName}', options)
${pre}    ${genName};
${pre}},
\n`+ pre+suf;
            });
    program.pretend || fs.writeFileSync(factoryFn, factoryCode);
  }

  function writeMapped(dest, code) {
    if (program.force || ! pathExists(dest)) {
      console.log('  create '+dest);
      program.pretend || fs.writeFileSync(dest, code);
    }
  }

  function mapped(fileType) {
    const tCode = fs.readFileSync(newModelSkel+fileType+'.js').toString();
    return templateString(tCode, {
      modelName,
      reqModel(text, pos) {
        return `${modelName} = require('./${name}')`;
      },
      persistenceTest(text, pos) {
        const indent = tCode.slice(findStartOfLine(tCode, pos), pos);
        return columns.map(col => {
          const [name, type='text'] = col.split(':');
          const value = name === 'name' ? `"${modelName} 1"` : `doc.${name}`;
          return `assert.equals(loaded.${name}, ${value});`;
        }).join("\n"+indent);
        return text;
      },
      modelFields(text, pos) {
        const indent = tCode.slice(findStartOfLine(tCode, pos), pos);
        return columns.map(col => {
          const [name, type='text'] = col.split(':');
          return `${name}: {type: "${type}"}`;
        }).join(",\n"+indent);
      }
    });
  }
};

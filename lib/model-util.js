const path = require('path');
const fs = require('fs');
const {templateString,
       classifyString,
       camelizeString,
       mkdir_p,
       findStartOfLine,
       pathExists,
       topDir
      } = require('./script-utils');


exports.createModel = (name, columns, newModelSkel, program)=>{
  const modelName = classifyString(name);
  const modelDir = topDir('app/models');
  const modelFn = `${modelDir}/${name}.js`;
  if (pathExists(modelFn))
    throw new Error(`Model file ${modelFn} already exists!`);

  // create model
  mkdir_p(modelDir);
  writeMapped(modelFn, mapped('model'), program);
  writeMapped(`${modelDir}/${name}-test.js`, mapped('model-test'), program);

  // create migration
  const now = new Date;
  const scriptName = `${now.toISOString().replace(/:/g, '-').replace(/\..*$/, '')}-create-${name}.js`;
  const migDir = topDir('db/migrate');
  mkdir_p(migDir);
  writeMapped(`${migDir}/${scriptName}`, mapped('migrate-create-model'), program);

  const factoryFn = topDir('app/test/factory.js');
  const factoryExits = pathExists(factoryFn);
  if (! factoryExits) {
    writeMapped(factoryFn, fs.readFileSync(newModelSkel+'factory.js'), program);
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

exports.createPublish = (name, modelModule, newPublishSkel, program)=>{
  const publishName = camelizeString(name);
  const modelName = classifyString(modelModule);

  // create publish
  const pubDir = topDir('app/publish');
  mkdir_p(pubDir);
  writeMapped(`${pubDir}/${name}-client.js`, mapped('publish-client'), program);
  writeMapped(`${pubDir}/${name}-client-test.js`, mapped('publish-client-test'), program);

  writeMapped(`${pubDir}/${name}-server.js`, mapped('publish-server'), program);
  writeMapped(`${pubDir}/${name}-server-test.js`, mapped('publish-server-test'), program);

  function mapped(fileType) {
    const forClient = /-client\b/.test(fileType);
    const tCode = fs.readFileSync(newPublishSkel+fileType+'.js').toString();
    return templateString(tCode, {
      modelName,
      modelModule,
      publishName,
      publishModule() {
        return name+(forClient ? '-client' : '-server');
      }
    });
  }

};

function writeMapped(dest, code, program) {
  if (program.force || ! pathExists(dest)) {
    console.log('  create '+dest);
    program.pretend || fs.writeFileSync(dest, code);
  }
}

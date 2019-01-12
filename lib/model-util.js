const path = require('path');
const fs = require('fs');
const {templateString,
       classifyString,
       camelizeString,
       mkdir_p,
       findStartOfLine,
       pathExists,
       topDir,
       writeMapped,
      } = require('./script-utils');


exports.createModel = (name, columns, newModelSkel, program)=>{
  const modelName = classifyString(name);
  const modelDir = topDir('app/models');
  const modelFn = `${modelDir}/${name}.js`;
  if (pathExists(modelFn))
    throw new Error(`Model file ${modelFn} already exists!`);

  const mapped = (fileType)=>{
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
  };

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

};

exports.createPublish = (name, modelModule, newPublishSkel, program)=>{
  const publishName = camelizeString(name);
  const modelName = classifyString(modelModule);

  // create publish
  const pubDir = topDir('app/pubsub');
  mkdir_p(pubDir);
  writeMapped(`${pubDir}/${name}-sub.js`, mapped('sub'), program);
  writeMapped(`${pubDir}/${name}-sub-test.js`, mapped('sub-test'), program);

  writeMapped(`${pubDir}/${name}-pub.js`, mapped('pub'), program);
  writeMapped(`${pubDir}/${name}-pub-test.js`, mapped('pub-test'), program);

  function mapped(fileType) {
    const forClient = /-client\b/.test(fileType);
    const tCode = fs.readFileSync(newPublishSkel+fileType+'.js').toString();
    return templateString(tCode, {
      modelName,
      modelModule,
      publishName,
      fileName: name,
    });
  }

};

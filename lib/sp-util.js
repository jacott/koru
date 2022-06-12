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
const {parse, walk, walkArray} = require('./js-parse-walker');

const relDir = 'app/server-pages';
const spDir = topDir(relDir);

exports.createPage = (name, skelDir, program)=>{
  exports.ensureLayout(skelDir, program);
  exports.ensureWired(skelDir, program);

  const className = classifyString(name);
  const pathName = `${spDir}/${name}`;
  const fileName = pathName+'.js';
  const prefix = `${relDir}/${name}`;

  const mapped = (fileType)=>{
    const tCode = fs.readFileSync(skelDir+fileType).toString();
    return templateString(tCode, {
      className,
      prefix,
    });
  };

  writeMapped(fileName, mapped('sp.js'), program);
  writeMapped(pathName+'.html', mapped('sp.html'), program);
  writeMapped(pathName+'.less', mapped('sp.less'), program);
};

exports.ensureLayout = (skelDir, program)=>{
  const pathName = `${spDir}/layouts`;

  if (pathExists(pathName)) return;

  mkdir_p(pathName);

  for (const i of ['html', 'js', 'less'])
    writeMapped(pathName+'/default.'+i, mapped(i), program);

  writeMapped(`${spDir}/global.lessimport`, mapped('global.lessimport'), program);

  function mapped(fileType) {
    const tCode = fs.readFileSync(skelDir+'layout.'+fileType).toString();
    return templateString(tCode, {
    });
  }
};

exports.ensureWired = (skelDir, program)=>{
  const startServer = topDir('app/startup-server.js');

  if (! pathExists(startServer)) {
    console.log("Warning no file: "+startServer);
    return;
  }

  const codeIn = fs.readFileSync(startServer).toString();

  const ans = parseCode(codeIn);

  if (ans === undefined) return;
  const {requireNode, newNodePos, webServerName} = ans;
  if (requireNode === undefined || newNodePos === -1) {
    console.log(`WARNING: can't wire server-page to WebServer in ${startServer}`);
    return;
  }
  const indent = codeIn.slice(codeIn.lastIndexOf('\n', requireNode.start)+1, requireNode.start);

  const reqws = webServerName ? '' : `const WebServer = require('koru/web-server');\n${indent}`;
  const reqsp = `const ServerPages = require('koru/server-pages');\n${indent}`;

  const newSP = `${indent}await ServerPages.build(${webServerName||'WebServer'});\n${indent}`;
  const result = codeIn.slice(0, requireNode.start) + reqsp + reqws +
        codeIn.slice(requireNode.start, newNodePos) + newSP +
        codeIn.slice(newNodePos);
  program.pretend || fs.writeFileSync(startServer, result);

};

const parseCode = (codeIn)=>{
  let ast;
  try {
    ast = parse(codeIn, {});
  } catch(ex) {
    const msg = `Error parsing ${codeIn}`;
    if (ex.name === 'SyntaxError')
      throw new Error(`${msg}:\n${ex}`);
    throw ex;
  }

  let defineBlock, requireNode, webServerName, newNode;
  let found = false;

  const isCallOf = (node, name)=> node != null && node.type === 'CallExpression' &&
        node.callee.name === name;

  const findInsertPos = (node) => {
    if (node.type === 'VariableDeclaration') {
      const pn = node;
      walkArray(node.declarations, node =>{
        if (isCallOf(node.init, 'require') && node.init.arguments.length == 1) {
          requireNode = pn;
          const snode = node.init.arguments[0];
          if (snode.type === 'StringLiteral') {
            switch(snode.value) {
            case 'koru/server-pages':
              found = true;
              break;
            case 'koru/web-server':
              webServerName = node.id.name;
              break;
            }
          }
        }
      });
    } else if (node.type === 'ReturnStatement') {
      const value = node.argument;
      if (value.body != null) {
        newNode = node.argument;
      } else if (value.type === 'Identifier') {
        const {name} = value;
        walk(defineBlock, node =>{
          if (node.type === 'VariableDeclarator') {
            if (node.id.name !== name) return 2;
            newNode = node.init;
            return 0;
          } else if (node.type === 'FunctionDeclaration') {
            if (node.id.name === name) {
              newNode = node;
              return 0;
            }
          }
          return 1;
        });
      }
    }
    return 1;
  };


  if (walk(ast, node => {
    if (isCallOf(node, 'define') && node.arguments.length == 1 && node.arguments[0].body != null) {
      defineBlock = node.arguments[0].body;
      walk(defineBlock, findInsertPos);
      return 0;
    }
    return 1;
  }) == 0 && ! found) {
    let newNodePos = -1;

    if (newNode !== undefined && newNode.body != null) {
      if (newNode.body.body.length != 0) {
        newNode = newNode.body.body[newNode.body.body.length-1];
        newNodePos = codeIn.indexOf('}', newNode.end);
      } else
        newNodePos = codeIn.indexOf('}', newNode.start);
    }

    return {requireNode, newNodePos, webServerName};

  }
};

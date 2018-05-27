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

const relDir = 'app/server-pages';
const spDir = topDir(relDir);

exports.createPage = (name, skelDir, program)=>{
  exports.ensureLayout(skelDir, program);
  exports.ensureWired(skelDir, program);

  const className = classifyString(name);
  const pathName = `${spDir}/${name}`;
  const fileName = pathName+'.js';
  const prefix = `${relDir}/${name}`;

  writeMapped(fileName, mapped('sp.js'), program);
  writeMapped(pathName+'.html', mapped('sp.html'), program);
  writeMapped(pathName+'.less', mapped('sp.less'), program);

  function mapped(fileType) {
    const tCode = fs.readFileSync(skelDir+fileType).toString();
    return templateString(tCode, {
      className,
      prefix,
    });
  }
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
  const {requireNode, newNode, webServerName} = ans;
  if (requireNode === undefined || newNode === undefined) {
    console.log(`WARNING: can't wire server-page to WebServer in ${startServer}`);
    return;
  }
  const indent = codeIn.slice(codeIn.lastIndexOf('\n', requireNode.start)+1, requireNode.start);

  const reqws = webServerName ? '' : `const WebServer = require('koru/web-server');\n${indent}`;
  const reqsp = `const ServerPages = require('koru/server-pages');\n${indent}`;

  const newSP = `${indent}new ServerPages(${webServerName||'WebServer'});\n${indent}`;
  const result = codeIn.slice(0, requireNode.start) + reqsp + reqws +
        codeIn.slice(requireNode.start, newNode.end-1) + newSP +
        codeIn.slice(newNode.end-1);
  program.pretend || fs.writeFileSync(startServer, result);

};

const parseCode = (codeIn)=>{
  const {parse} = require('babylon');

  let ast;
  try {
    ast = parse(codeIn);
  } catch(ex) {
    const msg = `Error parsing ${codeIn}`;
    if (ex.name === 'SyntaxError')
      throw new Error(`${msg}:\n${ex}`);
    throw ex;
  }

  const expr = (node, lookFor)=>{
    if (! node) return;

    if (Array.isArray(node)) {
      node.forEach(n => expr(n, lookFor));
      return;
    }
    lookFor(node);
  };

  let defineBlock, requireNode, webServerName, newNode;
  let found = false;

  expr(ast.program.body, node => {
    if (node.type === 'ExpressionStatement') {
      const {expression} = node;
      if (expression.callee && expression.callee.name === 'define') {
        expr(expression.arguments, node => {
          switch(node.type) {
          case 'FunctionExpression': case 'ArrowFunctionExpression':
            requireNode = node.body.body[0];
            defineBlock = node.body.body;
          }
        });
      }
    }
  });

  if (defineBlock) {
    expr(defineBlock, node => {
      if (found) return;
      switch(node.type) {
      case 'VariableDeclaration':
        const pn = node;
        expr(node.declarations, node =>{
          const {init} = node;
          if (init && init.callee && init.callee.name === 'require') {
            requireNode = pn;
            if (init.arguments.length === 1) {
              const snode = init.arguments[0];
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
          }
        });
        break;
      case 'ReturnStatement':
        const {argument} = node;
        switch(argument.type) {
        case 'ArrowFunctionExpression': case 'FunctionExpression':
          newNode = argument.body;
          break;
        case 'Identifier':
          const name = argument.name;
          expr(defineBlock, node =>{
            switch(node.type) {
            case 'VariableDeclaration':
              expr(node.declarations, node => {
                if (node.id.name === name) {
                  const {init} = node;
                  switch(init.type) {
                  case 'ArrowFunctionExpression': case 'FunctionExpression':
                    newNode = init.body;
                    break;
                  }
                }
              });
              break;
            case 'FunctionDeclaration':
              if (node.id.name === name)
                newNode = node.body;
            }
          });
          break;
        }
      }
    });

    if (found) return;

    return {requireNode, newNode, webServerName};
  }
};

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
  const {requireNode, newNodePos, webServerName} = ans;
  if (requireNode === undefined || newNodePos === undefined || newNodePos === -1) {
    console.log(`WARNING: can't wire server-page to WebServer in ${startServer}`);
    return;
  }
  const indent = codeIn.slice(codeIn.lastIndexOf('\n', requireNode.start.pos)+1, requireNode.start.pos);

  const reqws = webServerName ? '' : `const WebServer = require('koru/web-server');\n${indent}`;
  const reqsp = `const ServerPages = require('koru/server-pages');\n${indent}`;

  const newSP = `${indent}new ServerPages(${webServerName||'WebServer'});\n${indent}`;
  const result = codeIn.slice(0, requireNode.start.pos) + reqsp + reqws +
        codeIn.slice(requireNode.start.pos, newNodePos) + newSP +
        codeIn.slice(newNodePos);
  program.pretend || fs.writeFileSync(startServer, result);

};

const parseCode = (codeIn)=>{
  const terser = require('terser');

  let ast;
  try {
    ast = terser.parse(codeIn, {});
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

  let requireNode, webServerName, newNode;
  let found = false;

  const isCallOf = (node, name)=> node && (node instanceof terser.AST_Call) &&
        node.expression.TYPE === 'SymbolRef' && node.expression.name === name;

  try {
    ast.walk(new terser.TreeWalker(node =>{
      if (isCallOf(node, 'define')) {
        expr(node.args, node => {
          if (node instanceof terser.AST_Lambda) {
            requireNode = node.body[0];
            throw node.body;
          }
        });
      }
    }));
  } catch(defineBlock) {
    expr(defineBlock, node => {
      if (found) return;
      if (node instanceof terser.AST_Definitions) {
        const pn = node;
        expr(node.definitions, node =>{
          const {name, value} = node;
          if (isCallOf(value, 'require')) {
            requireNode = pn;
            if (value.args.length === 1) {
              const snode = value.args[0];
              if (snode.TYPE === 'String') {
                switch(snode.value) {
                case 'koru/server-pages':
                  found = true;
                  break;
                case 'koru/web-server':
                  webServerName = node.name.name;
                  break;
                }
              }
            }
          }
        });
      } else if (node.TYPE === 'Return') {
        const {value} = node;
        if (value instanceof terser.AST_Lambda) {
          newNode = value;
        } else if (value.TYPE === 'SymbolRef') {
          const {name} = value;
          expr(defineBlock, node =>{
            if (node instanceof terser.AST_Definitions) {
              expr(node.definitions, node => {
                if (node.name.name === name) {
                  const {value} = node;
                  if(value instanceof terser.AST_Lambda) {
                    newNode = value;
                  }
                }
              });
            } else if (node instanceof terser.AST_Defun) {
              if (node.name.name === name)
              newNode = node;
            }
          });
        }
      }
    });

    if (found) return;

    let newNodePos;

    if (newNode !== undefined && ! newNode.inline) {
      if (newNode.body.length != 0) {
        newNode = newNode.body[newNode.body.length-1];
        newNodePos = codeIn.indexOf('}', newNode.end.endpos);
      } else
        newNodePos = codeIn.indexOf('}', newNode.start.endpos);
    }

    return {requireNode, newNodePos, webServerName};
  }
};

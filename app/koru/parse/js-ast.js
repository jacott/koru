define((require, exports, module) => {
  'use strict';
  const {parse, walk, walkArray,
         visitorKeys, inferVisitorKeys,
         VISITOR_KEYS
        } = requirejs.nodeRequire('./js-parse-walker');

  const defaultOptions = { allowImportExportEverywhere: true, plugins: ['classProperties', 'classStaticBlock'] };

  const last = (a) => a[a.length - 1];

  class Scope {
    constructor(parentPath) {
      this.parentPath = parentPath;
      this.bindings = {};
    }

    getAllBindings() {
      const list = Object.assign({}, this.bindings);
      for (let path = this.parentPath; path !== null; path = path.scope.parentPath) {
        const {bindings} = path.scope;
        for (const n in bindings) {
          if (list[n] === void 0) list[n] = bindings[n];
        }
      }
      return list;
    }
  }

  return {
    VISITOR_KEYS,
    visitorKeys,
    inferVisitorKeys,
    defaultOptions,
    parse: (source, opts=defaultOptions) => parse(source, opts),
    walk,
    walkArray,

    scopeWalk: (ast, callback) => {
      const parents = [];

      const walkChild = (cn, scope) => {
        if (cn !== null && typeof cn === 'object') {
          if (Array.isArray(cn)) {
            for (const n of cn) {
              const {type} = n;
              if (type === 'FunctionDeclaration') {
                scope.bindings[n.id.name] = {isLive: true, node: n};
              } else if (type === 'VariableDeclaration' && n.kind === 'var') {
                for (const d of n.declarations) {
                  scope.bindings[d.id.name] = {isLive: true, node: d};
                }
              }

            }
            for (const n of cn) {
              const {type} = n;
              if (type === 'VariableDeclaration' && n.kind !== 'var') {
                for (const d of n.declarations) {
                  const b = scope.bindings[d.id.name] = {isLive: n.kind == 'let', node: d};
                  walk(d);
                  b.isLive = true;
                }
              } else if (type === 'ClassDeclaration') {
                const b = scope.bindings[n.id.name] = {isLive: false, node: n};
                walkChild(n.superClass);
                b.isLive = true;
                walkChild(n.body);
              } else {
                walk(n);
              }
            }
          } else {
            walk(cn);
          }
        }
      };

      const walkChildren = (path) => {
        const {node, scope} = path;
        parents.push(path);
        for (const key of visitorKeys(node)) {
          walkChild(node[key], scope);
        }
        parents.pop(path);
      };


      const walk = (node) => {
        const parent = parents.length == 0 ? null : last(parents);
        const scope = new Scope(parent);
        const path = {
          node,
          scope,
        };

        let done = false;
        callback(path, (path) => {
          done = true;
          walkChildren(path);
        });
        done || walkChildren(path)
      };

      walk(ast);
    },
  };
});

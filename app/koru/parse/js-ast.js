define((require, exports, module) => {
  'use strict';
  const {parse, walk, walkArray,
         visitorKeys, inferVisitorKeys,
         VISITOR_KEYS,
        } = requirejs.nodeRequire('./js-parse-walker');

  const defaultOptions = {
    allowImportExportEverywhere: true,
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    allowSuperOutsideMethod: true,
    allowUndeclaredExports: true,
    createParenthesizedExpressions: true,
    errorRecovery: true,
    plugins: ['classProperties', 'classStaticBlock']};

  const last = (a) => a[a.length - 1];

  class Scope {
    constructor(parentPath=null) {
      this.parentPath = parentPath;
      this.bindings = {};
    }

    getAllBindings() {
      const list = Object.assign({}, this.bindings);
      for (let path = this.parentPath; path !== null; path = path.scope.parentPath) {
        const {bindings} = path.scope;
        for (const n in bindings) {
          if (list[n] === undefined) list[n] = bindings[n];
        }
      }
      return list;
    }

    get(name) {
      if (this.bindings[name] !== undefined) return this.bindings[name];
      for (let path = this.parentPath; path !== null; path = path.scope.parentPath) {
        return path.scope.get(name);
      }
    }
  }

  const walkHoistBody = (walker, scope, node) => {
    walkHoistScope(walker, scope, node.body);
  };

  const HoistNodes = {
    Program: walkHoistBody,
    FunctionDeclaration: walkHoistBody,
    FunctionExpression: walkHoistBody,
    ArrowFunctionExpression: walkHoistBody,
    ClassDeclaration: walkHoistBody,
    ClassExpression: walkHoistBody,
  };

  const walkHoistScope = (walker, scope, nodes) => {
    if (nodes == null) return;
    for (const n of Array.isArray(nodes) ? nodes : [nodes]) {
      const {type} = n;
      if (type === 'FunctionDeclaration') {
        scope.bindings[n.id.name] = {isLive: true, node: n};
      } else if (type === 'VariableDeclaration' && n.kind === 'var') {
        walker.VariableDeclaration(n, scope, false);
      } else if (HoistNodes[type] === undefined) {
        for (const a of VISITOR_KEYS[type]) {
          walkHoistScope(walker, scope, n[a]);
        }
      }
    }
  };

  class ScopeWalker {
    parents = [];

    constructor(callback) {
      this.callback = callback;
    }

    walkChild(cn, scope) {
      if (cn !== null && typeof cn === 'object') {
        for (const n of Array.isArray(cn) ? cn : [cn]) {
          this.walk(n, scope);
        }
      }
    }

    withScope(node, body) {
      const scope = new Scope(this.parents.length == 0 ? null : last(this.parents));
      this.parents.push({node, scope});
      try {
        body(scope);
      } finally {
        this.parents.pop();
      }
    }

    walk(node, scope) {
      this.callback(node, scope);
      if (this[node.type] !== undefined) {
        this[node.type](node, scope);
      } else {
        this.withScope(node, (scope) => {
          HoistNodes[node.type]?.(this, scope, node);
          for (const key of visitorKeys(node)) {
            this.walkChild(node[key], scope);
          }
        });
      }
    }

    bindVars(scope, nodes, isLive=false, descend=true) {
      const bindVar = (id, init) => {
        if (id.type === 'Identifier') {
          descend && this.walk(id, scope);
          scope.bindings[id.name] = {isLive, id};
          descend && init != null && this.walk(init, scope);
          if (! isLive) {
            scope.bindings[id.name].isLive = true;
          }
        } else {
          declareVisitor(id, init);
        }
      };

      const declareVisitor = (key, value) => {
        switch (key.type) {
        case 'ObjectPattern':
          for (const node of key.properties) {
            if (node.type === 'ObjectProperty') {
              declareVisitor(node.key, node.value);
            } else {
              throw new Error('wrong type ' + node.type);
            }
          }
          break;
        case 'RestElement':
          descend && this.walk(key, scope);
          scope.bindings[key.argument.name] = {isLive: true, key: key.argument};
          return;
        case 'Identifier':
          if (value == null) {
            descend && this.walk(key, scope);
            scope.bindings[key.name] = {isLive: true, key};
          } else if (value.type === 'Identifier') {
            descend && this.walk(key, scope);
            scope.bindings[value.name] = {isLive: true, value};
            descend && this.walk(value, scope);
          } else {
            declareVisitor(value);
          }
          return;
        case 'AssignmentPattern':
          bindVar(key.left, key.right);
          break;
        case 'ArrayPattern':
          for (const node of key.elements) {
            bindVar(node);
          }
          break;
        default:
          throw new Error('unexpected type ' + key.type + ':' + key.start);
        }
        descend && value != null && this.walk(value, scope);
      };

      for (const d of nodes) {
        if (d.type === 'VariableDeclarator') {
          bindVar(d.id, d.init);
        } else {
          bindVar(d);
        }
      }
    }

    VariableDeclaration(node, scope, descend) {
      this.bindVars(scope, node.declarations, node.kind === 'var', descend);
    }

    ClassDeclaration(node, scope) {
      const b = scope.bindings[node.id.name] = {isLive: false, node};
      this.walkChild(node.superClass, scope);
      b.isLive = true;
      this.walkChild(node.body, scope);
    }

    ClassMethod(node, scope) {
      this.walk(node.key, scope);
      this.FunctionExpression(node, scope);
    }

    FunctionExpression(node, scope) {
      this.withScope(node, (scope) => {
        HoistNodes[node.type]?.(this, scope, node);
        if (node.id != null) {
          this.walk(node.id, scope);
          scope.bindings[node.id.name] = {isLive: true, node: node.id};
        }
        this.bindVars(scope, node.params);
        node.body != null && this.walk(node.body, scope);
      });
    }
  }

  ScopeWalker.prototype.ArrowFunctionExpression = ScopeWalker.prototype.FunctionExpression;
  ScopeWalker.prototype.FunctionDeclaration = ScopeWalker.prototype.FunctionExpression;
  ScopeWalker.prototype.ObjectMethod = ScopeWalker.prototype.ClassMethod;

  return {
    VISITOR_KEYS,
    ScopeWalker,
    visitorKeys,
    inferVisitorKeys,
    defaultOptions,
    parse: (source, opts=defaultOptions) => parse(source, opts),
    walk,
    walkArray,

    scopeWalk: (ast, callback) => {new ScopeWalker(callback).walk(ast, new Scope())},
  };
});

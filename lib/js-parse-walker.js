exports.parse = require('@babel/parser').parse;

const VISITOR_KEYS = exports.VISITOR_KEYS = {
  File: [ 'program' ],
  Program: [ 'body' ],
  ImportDeclaration: [ 'source' ],
  ImportDefaultSpecifier: [ 'local' ],
  Identifier: [],
  StringLiteral: [],
  ImportSpecifier: [ 'imported', 'local' ],
  ImportNamespaceSpecifier: [ 'local' ],
  VariableDeclaration: [ 'declarations' ],
  VariableDeclarator: [ 'id', 'init' ],
  NumericLiteral: [],
  ExportNamedDeclaration: [ 'source', 'specifiers', 'declaration' ],
  FunctionDeclaration: [ 'id', 'params', 'body' ],
  BlockStatement: [ 'body' ],
  ClassDeclaration: [ 'id', 'superClass', 'body' ],
  ClassBody: [ 'body' ],
  ExportSpecifier: [ 'local', 'exported' ],
  ObjectPattern: [ 'properties' ],
  ObjectProperty: [ 'key', 'value' ],
  ExportDefaultDeclaration: [ 'declaration' ],
  ExportAllDeclaration: [ 'source' ],
  ExportNamespaceSpecifier: [ 'exported' ],
  ExpressionStatement: [ 'expression' ],
  CallExpression: [ 'callee', 'arguments' ],
  FunctionExpression: [ 'body' ],
  Import: [],
  MemberExpression: [ 'object', 'property' ],
  TemplateLiteral: [ 'quasis', 'expressions' ],
  TemplateElement: [],
  MetaProperty: [ 'meta', 'property' ],
  ClassMethod: [ 'key', 'params', 'body' ],
  AssignmentExpression: [ 'left', 'right' ],
  ThisExpression: [],
  AssignmentPattern: [ 'left', 'right' ],
  ObjectExpression: [ 'properties' ],
  ArrayPattern: [ 'elements' ],
  ReturnStatement: [ 'argument' ],
  SpreadElement: [ 'argument' ],
  LogicalExpression: [ 'left', 'right' ],
  RegExpLiteral: [],
  ForStatement: [ 'init', 'test', 'update', 'body' ],
  BinaryExpression: [ 'left', 'right' ],
  UpdateExpression: [ 'argument' ],
  RestElement: [ 'argument' ],
  ForOfStatement: [ 'left', 'right', 'body' ],
  YieldExpression: [ 'argument' ],
  ForInStatement: [ 'left', 'right', 'body' ],
  ArrowFunctionExpression: [ 'params', 'body' ],
  ClassExpression: [ 'superClass', 'body' ],
  ClassProperty: [ 'key', 'value' ],
  ArrayExpression: [ 'elements' ],
  TaggedTemplateExpression: [ 'tag', 'quasi' ],
  IfStatement: [ 'test', 'consequent', 'alternate' ],
  SwitchStatement: [ 'discriminant', 'cases' ],
  SwitchCase: [ 'consequent' ],
  BreakStatement: [ 'label' ],
  UnaryExpression: [ 'argument' ],
  NewExpression: [ 'callee', 'arguments' ],
  ConditionalExpression: [ 'test', 'consequent', 'alternate' ],
  NullLiteral: [],
  OptionalCallExpression: [ 'callee' ],
  SequenceExpression: [ 'expressions' ],
  LabeledStatement: [ 'label', 'body' ],
  DoWhileStatement: [ 'body', 'test' ],
  WhileStatement: [ 'test', 'body' ],
  ContinueStatement: [ 'label' ],
  BooleanLiteral: [],
  EmptyStatement: [],
  ObjectMethod: [ 'key', 'params', 'body' ],
  OptionalMemberExpression: [ 'object', 'property' ],
  TryStatement: [ 'block', 'handler' ],
  BigIntLiteral: [],
  ThrowStatement: [ 'argument' ],
  CatchClause: [ 'param', 'body' ],
  Super: [],
  AwaitExpression: [ 'argument' ],
  ClassPrivateProperty: [ 'key', 'value' ],
  PrivateName: [ 'id' ],
  StaticBlock: [ 'body' ]
};

const CommonNodeEntry = {
  loc: true,
  errors: true,
  innerComments: true,
  leadingComments: true,
  trailingComments: true,
  comments: true,
  extra: true,
  range: true,
};

const inferVisitorKeys = exports.inferVisitorKeys = (ast) => {
  const keys = [];
  for (const key in ast) {
    const node = ast[key];
    if (typeof node === 'object' && node !== null && CommonNodeEntry[key] === void 0) {
      if (Array.isArray(node)) {
        if (node.length != 0) keys.push([node[0].start, key]);
      } else if (node.type !== void 0) {
        keys.push([node.start, key]);
      }
    }
  }
  keys.sort(([a], [b]) => a - b)

  return keys.map((i) => i[1]);
};

const visitorKeys = exports.visitorKeys = (ast) => VISITOR_KEYS[ast.type] ?? inferVisitorKeys(ast);

const walk = (ast, callback) => {
  for (const key of visitorKeys(ast)) {
    const node = ast[key];
    if (node !== null && typeof node === 'object') {
      if (Array.isArray(node)) {
        if (walkArray(node, callback) == 0) return 0;
      } else {
        switch (callback(node)) {
        case 0: return 0;
        case 1: if (walk(node, callback) == 0) return 0;
        }
      }
    }
  }
  return 1;
};

const walkArray = (ast, callback) => {
  for (const n of ast) {
    switch (callback(n)) {
    case 0: return 0;
    case 1: if (walk(n, callback) == 0) return 0;
    }
  }
  return 1;
};

exports.walk = walk;
exports.walkArray = walkArray;

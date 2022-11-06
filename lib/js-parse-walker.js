exports.parse = require('@babel/parser').parse;

const VISITOR_KEYS = exports.VISITOR_KEYS = {
  ArrayExpression: ['elements'],
  ArrayPattern: ['elements'],
  ArrowFunctionExpression: ['params', 'body'],
  AssignmentExpression: ['left', 'right'],
  AssignmentPattern: ['left', 'right'],
  AwaitExpression: ['argument'],
  BigIntLiteral: [],
  BinaryExpression: ['left', 'right'],
  BlockStatement: ['body'],
  BooleanLiteral: [],
  BreakStatement: ['label'],
  CallExpression: ['callee', 'arguments'],
  CatchClause: ['param', 'body'],
  ClassBody: ['body'],
  ClassDeclaration: ['id', 'superClass', 'body'],
  ClassExpression: ['superClass', 'body'],
  ClassMethod: ['key', 'params', 'body'],
  ClassPrivateProperty: ['key', 'value'],
  ClassProperty: ['key', 'value'],
  ConditionalExpression: ['test', 'consequent', 'alternate'],
  ContinueStatement: ['label'],
  DoWhileStatement: ['body', 'test'],
  EmptyStatement: [],
  ExportAllDeclaration: ['source'],
  ExportDefaultDeclaration: ['declaration'],
  ExportNamedDeclaration: ['specifiers', 'source', 'declaration'],
  ExportNamespaceSpecifier: ['exported'],
  ExportSpecifier: ['local', 'exported'],
  ExpressionStatement: ['expression'],
  File: ['program'],
  ForInStatement: ['left', 'right', 'body'],
  ForOfStatement: ['left', 'right', 'body'],
  ForStatement: ['init', 'test', 'update', 'body'],
  FunctionDeclaration: ['id', 'params', 'body'],
  FunctionExpression: ['id', 'params', 'body'],
  Identifier: [],
  IfStatement: ['test', 'consequent', 'alternate'],
  Import: [],
  ImportDeclaration: ['specifiers', 'source'],
  ImportDefaultSpecifier: ['local'],
  ImportNamespaceSpecifier: ['local'],
  ImportSpecifier: ['imported', 'local'],
  InterpreterDirective: [],
  LabeledStatement: ['label', 'body'],
  LogicalExpression: ['left', 'right'],
  MemberExpression: ['object', 'property'],
  MetaProperty: ['meta', 'property'],
  NewExpression: ['callee', 'arguments'],
  NullLiteral: [],
  NumericLiteral: [],
  ObjectExpression: ['properties'],
  ObjectMethod: ['key', 'params', 'body'],
  ObjectPattern: ['properties'],
  ObjectProperty: ['key', 'value'],
  OptionalCallExpression: ['callee'],
  OptionalMemberExpression: ['object', 'property'],
  ParenthesizedExpression: ['expression'],
  PrivateName: ['id'],
  Program: ['interpreter', 'body'],
  RegExpLiteral: [],
  RestElement: ['argument'],
  ReturnStatement: ['argument'],
  SequenceExpression: ['expressions'],
  SpreadElement: ['argument'],
  StaticBlock: ['body'],
  StringLiteral: [],
  Super: [],
  SwitchCase: ['test', 'consequent'],
  SwitchStatement: ['discriminant', 'cases'],
  TaggedTemplateExpression: ['tag', 'quasi'],
  TemplateElement: [],
  TemplateLiteral: ['quasis', 'expressions'],
  ThisExpression: [],
  ThrowStatement: ['argument'],
  TryStatement: ['block', 'handler', 'finalizer'],
  UnaryExpression: ['argument'],
  UpdateExpression: ['argument'],
  VariableDeclaration: ['declarations'],
  VariableDeclarator: ['id', 'init'],
  WhileStatement: ['test', 'body'],
  YieldExpression: ['argument'],
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
    if (typeof node === 'object' && node !== null && CommonNodeEntry[key] === undefined) {
      if (Array.isArray(node)) {
        if (node.length != 0) keys.push([node[0].start, key]);
      } else if (node.type !== undefined) {
        keys.push([node.start, key]);
      }
    }
  }
  keys.sort(([a], [b]) => a - b);

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

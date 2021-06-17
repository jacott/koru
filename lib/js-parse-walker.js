exports.parse = require('@babel/parser').parse;
exports.types = require('@babel/types');

const t = exports.types;

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

const walk = (ast, callback) => {
  for (const key of t.VISITOR_KEYS[ast.type]) {
    const node = ast[key];
    if (typeof node === 'object' && node !== null && CommonNodeEntry[key] === void 0) {
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

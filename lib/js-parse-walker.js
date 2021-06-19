exports.parse = require('@babel/parser').parse;
const {VISITOR_KEYS} = require('@babel/types/lib/definitions');

exports.VISITOR_KEYS = VISITOR_KEYS;

const walk = (ast, callback) => {
  for (const key of VISITOR_KEYS[ast.type]) {
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

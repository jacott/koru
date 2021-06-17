define((require, exports, module) => {
  'use strict';
  const {parse, walk, walkArray} = requirejs.nodeRequire('./js-parse-walker');

  const defaultOptions = { plugins: ['classProperties'] };

  return {
    parse: (source, opts = defaultOptions) => parse(source, opts),
    walk,
    walkArray,
  };
});

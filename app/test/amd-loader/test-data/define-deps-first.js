define([
  'test-data/dep2', 'require', 'test-data/subdir/dep1', 'exports', 'module',
], function (dep2, require, dep1, exports, module) {
  if (typeof require !== 'function') return 'expected to be passed require';
  if (typeof exports !== 'object') return 'expected to be passed exports';
  if (this !== (typeof window === 'undefined' ? global : window)) return 'expected to be called with global/window';
  if (this !== globalThis) return 'expected to be called with globalThis';
  if (dep2 !== true) return 'expected dep2 to be loaded';
  if (typeof dep1 !== 'function') return 'expected dep1 to be loaded';

  exports.success = true;
});

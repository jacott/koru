'use strict';
const {AsyncLocalStorage} = require('node:async_hooks');

Object.defineProperty(globalThis, '__koruThreadLocal', {
  value: exports.koruThreadLocal = new AsyncLocalStorage(),
  writable: false,
  enumerable: false,
});

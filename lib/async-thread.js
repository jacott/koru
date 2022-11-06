'use strict';
const {AsyncLocalStorage} = require('node:async_hooks');

globalThis.__koruThreadLocal = exports.koruThreadLocal = new AsyncLocalStorage();

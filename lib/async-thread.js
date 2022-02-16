const {AsyncLocalStorage} = require('async_hooks');

globalThis.__koruThreadLocal = exports.koruThreadLocal = new AsyncLocalStorage();

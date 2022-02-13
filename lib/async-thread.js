const {AsyncLocalStorage} = require('async_hooks');

const koruThreadLocal = new AsyncLocalStorage();

globalThis.__koruThreadLocal = exports.koruThreadLocal = koruThreadLocal;

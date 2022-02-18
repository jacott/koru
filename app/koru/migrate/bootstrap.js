define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const Migration       = require('koru/migrate/migration');
  const {defaultDb}     = require('koru/pg/driver');
  const fsp             = requirejs.nodeRequire('fs/promises');
  const path            = requirejs.nodeRequire('path');

  return async () => {
    const migrateDir = path.resolve(koru.appDir, '../db/migrate');
    try {
      await fsp.access(migrateDir);
    } catch (ex) {
      if (ex.code !== 'ENOENT') {
        throw ex;
      }
      return;
    }
    await new Migration(defaultDb).migrateTo(migrateDir, '~');
  };
});

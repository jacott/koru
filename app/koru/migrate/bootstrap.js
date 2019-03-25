define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const Migration       = require('koru/migrate/migration');
  const {defaultDb}     = require('koru/pg/driver');

  const path            = requirejs.nodeRequire('path');
  const fs              = requirejs.nodeRequire('fs');

  return ()=>{
    const migrateDir = path.resolve(koru.appDir, '../db/migrate');
    try {
      fs.accessSync(migrateDir);
    } catch(ex) {
      if (ex.code !== 'ENOENT')
        throw ex;
      return;
    }
    new Migration(defaultDb).migrateTo(migrateDir, '~');
  };
});

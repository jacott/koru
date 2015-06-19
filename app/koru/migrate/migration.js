var Future = requirejs.nodeRequire('fibers/future'), wait = Future.wait;
var fs = require('fs');
var Path = require('path');
var readdir = Future.wrap(fs.readdir);
var stat = Future.wrap(fs.stat);

define(function(require, exports, module) {
  var util = require('../util');
  var koru = require('../main');

  exports.addMigration = function (client, name, options) {
    doMigration(client, true, name, options);
  };


  exports.revertMigration = function (client, name, options) {
    doMigration(client, false, name, options);
  };

  exports.migrateTo = function (client, dirPath, pos) {
    try {
      var filenames = readdir(dirPath).wait().filter(function (fn) {
        return /.js$/.test(fn);
      }).sort();

      var migrations = getMigrations(client);

      for(var i = 0; i < filenames.length; ++i) {
        var row = filenames[i].replace(/\.js$/,'');
        if (row > pos)
          break;
        migrations[row] ||
          exports.addMigration(client, row, readMigration(dirPath+'/'+row));
      }
      util.reverseForEach(Object.keys(migrations).sort(), function (row) {
        if (row > pos)
          exports.revertMigration(client, row, readMigration(dirPath+'/'+row));
      });
    } finally {
      exports.migrations = null;
    }
  };

  function readMigration(mig) {
    var future = new Future;
    var id = mig+'.js';
    try {
      require([id], function (mig) {
        future.return(mig);
      });
      return future.wait();
    } finally {
      koru.unload(id);
    }
  }

  function getMigrations(client) {
    if (exports.migrations) return exports.migrations;
    client.query('CREATE TABLE IF NOT EXISTS "Migration" (name text PRIMARY KEY)');
    var migrations = exports.migrations = {};
    client.query('SELECT name FROM "Migration"').
      forEach(function (row) {migrations[row.name] = true});
    return migrations;
  }

  function doMigration(client, add, name, change) {
    client.transaction(function (tx) {
      if (migrationExists(client, name) === add) return;

      change(new MigrationControl(add, client));
      if (add) {
        client.query('INSERT INTO "Migration" VALUES ($1)', [name]);
        exports.migrations[name] = true;
      } else {
        client.query('DELETE FROM "Migration" WHERE name=$1', [name]);
        delete exports.migrations[name];
      }
    });
  }

  function migrationExists(client, name) {
    return !! getMigrations(client)[name];
  }

  function MigrationControl(add, client) {
    this.client = client;
    this.add = add;
  }

  MigrationControl.prototype = {
    constructor: MigrationControl,

    createTable: function (name, fields) {
      var qname = '"'+name+'"';
      if (this.add) {
        var list = ['_id varchar(17) PRIMARY KEY'];
        for (var col in fields) {
          var desc = fields[col].type;
          var colspec = '"'+col+'" '+desc;
          if (/\bprimary key\b/i.test(desc))
            list[0] = colspec;
          else
            list.push(colspec);
        }
        this.client.query('CREATE TABLE '+qname+' ('+list.join(',')+')');
      } else {
        this.client.query('DROP TABLE IF EXISTS '+qname);
      }
    },

    reversible: function (options) {
      if (this.add && options.add)
        options.add(this.client);
      if (! this.add && options.revert)
        options.revert(this.client);
    },
  };
});

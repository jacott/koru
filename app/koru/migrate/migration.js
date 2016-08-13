const Future = requirejs.nodeRequire('fibers/future'), wait = Future.wait;
const fs = require('fs');
const Path = require('path');
const readdir = Future.wrap(fs.readdir);
const stat = Future.wrap(fs.stat);

define(function(require, exports, module) {
  const koru = require('../main');
  const util = require('../util');

  class MigrationControl {
    constructor(add, client) {
      this.client = client;
      this.add = add;
    }

    createTable(name, fields, indexes) {
      var qname = '"'+name+'"';
      if (this.add) {
        var list = ['_id varchar(24) PRIMARY KEY'];
        for (var col in fields) {
          const colspec = this.client.jsFieldToPg(col, fields[col]);
          if (/\bprimary key\b/i.test(colspec))
            list[0] = colspec;
          else
            list.push(colspec);
        }
        this.client.query('CREATE TABLE '+qname+' ('+list.join(',')+')');
        if (indexes) {
          indexes.forEach(spec => {
            var i = 0;
            var unique = spec[0] === '*unique';
            if (unique) spec = spec.slice(1);
            var iname = name+'_'+spec.map(field => field.replace(/\s.*$/, '')).join('_');
            this.client.query((unique ? 'CREATE UNIQUE' : 'CREATE')+
                              ' INDEX "'+iname+'" ON '+qname+' USING btree ('+
                              spec.map(field => field.replace(/(^\S+)/, '"$1"'))
                              .join(',')+')');
          });
        }
      } else {
        this.client.query('DROP TABLE IF EXISTS '+qname);
      }
    }

    reversible(options) {
      if (this.add && options.add)
        options.add(this.client);
      if (! this.add && options.revert)
        options.revert(this.client);
    }
  }

  class Migration {
    constructor(client) {
      this._client = client;
    }

    addMigration(name, options) {
      this._doMigration(true, name, options);
    }

    revertMigration(name, options) {
      this._doMigration(false, name, options);
    }

    migrateTo(dirPath, pos, verbose) {
      if (! pos) throw new Error("Please specifiy where to migrate to");
      const filenames = readdir(dirPath).wait().filter(function (fn) {
        return /.js$/.test(fn);
      }).sort();

      const migrations = this._getMigrations();

      for(var i = 0; i < filenames.length; ++i) {
        var row = filenames[i].replace(/\.js$/,'');
        if (row > pos)
          break;
        if (! migrations[row]) {
          verbose && console.log("Adding " + row);
          this.addMigration(row, readMigration(dirPath+'/'+row));
        }
      }
      util.reverseForEach(Object.keys(migrations).sort(), row => {
        if (row > pos) {
          verbose && console.log("Reverting " + row);
          this.revertMigration(row, readMigration(dirPath+'/'+row));
        }
      });
    }

    migrationExists(name) {
      return !! this._getMigrations()[name];
    }

    _getMigrations() {
      if (this._migrations) return this._migrations;
      this._client.query('CREATE TABLE IF NOT EXISTS "Migration" (name text PRIMARY KEY)');
      this._migrations = Object.create(null);
      this._client.query('SELECT name FROM "Migration"').
        forEach(row => this._migrations[row.name] = true);
      return this._migrations;
    }

    _doMigration(add, name, change) {
      this._client.transaction(tx => {
        if (this.migrationExists(name) === add) return;

        change(new MigrationControl(add, this._client));
        if (add) {
          this._client.query('INSERT INTO "Migration" VALUES ($1)', [name]);
          this._migrations[name] = true;
        } else {
          this._client.query('DELETE FROM "Migration" WHERE name=$1', [name]);
          delete this._migrations[name];
        }
      });
    }
  }

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

  return Migration;
});

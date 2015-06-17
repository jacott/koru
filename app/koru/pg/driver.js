var Future = requirejs.nodeRequire('fibers/future');
var Libpq = require('pg-libpq'); // app installs this

var koru, util, makeSubject, match, Pool;

var pools = {};
var clientCount = 0;
var cursorCount = 0;

define(function(require, exports, module) {
  koru = require('../main');
  util = require('../util');
  makeSubject = require('../make-subject');
  match = require('../match');
  Pool = require('../pool-server');

  koru.onunload(module, 'reload');

  koru.onunload(module, closeDefaultDb);

  var defaultDb = null;

  function closeDefaultDb() {
    defaultDb && defaultDb.end();
    defaultDb = null;
  }

  return {
    isPG: true,

    get defaultDb() {
      if (defaultDb) return defaultDb;
      return defaultDb = new Client(module.config().url);
    },

    closeDefaultDb: closeDefaultDb,

    connect: function (url) {
      return new Client(url);
    },
  };
});

function aryToSqlStr(value) {
  if (! value) return value;

  if (! Array.isArray(value))
    throw new Error('Value is not an array: '+util.inspect(value));

  return '{'+value.map(function (v) {
    return JSON.stringify(v);
  }).join(',')+'}';
}

function getConn(client) {
  var tx = client._weakMap.get(util.thread);
  if (! tx) {
    client._weakMap.set(util.thread, tx = fetchPool(client).acquire());
  }
  ++tx.count;

  return tx.conn;
}

function releaseConn(client) {
  var tx = client._weakMap.get(util.thread);
  if (tx && --tx.count === 0) {
    fetchPool(client).release(tx);
    client._weakMap.set(util.thread, null);
  }
}

var conns = 0;

function fetchPool(client) {
  var pool = pools[client._id];
  if (pool) return pool;
  return pools[client._id] = new Pool({
    name: client._id,
    create: function (callback) {
      ++conns;
      new Connection(client, callback);
    },
    destroy: function (tx) {
      --conns;
      tx.conn.finish();
    },
    idleTimeoutMillis: 30*1000,
  });
}

function Connection(client, callback) {
  var self = this;
  var conn = self.conn = new Libpq(client._url, function (err) {
    callback(err, self);
  });
  self.count = 0;
  self.onAbort = function (func) {
    if (! self._onAborts) self._onAborts = [func];
    else
      self._onAborts.push(func);
  };
}

function Client(url) {
  this._id = (++clientCount).toString(36);
  this._url = url;
  this._weakMap = new WeakMap;
}

Client.prototype = {
  constructor: Client,

  $inspect: function () {
    return "Pg:" + this._url;
  },

  end: function () {
    var pool = pools[this._id];
    if (pool) {
      pool.drain();
    }
    delete pools[this._id];
  },

  withConn: function(func) {
    var tx = this._weakMap.get(util.thread);
    if (tx)
      return func.call(this, tx.conn);
    try {
      return func.call(this, getConn(this));
    } finally {
      releaseConn(this);
    }
  },

  findOne: function (text, params) {
    return this.query(text, params).rows[0];
  },

  query: function (text, params) {
    return this.withConn(function (conn) {
      return query(conn, text, params);
    });
  },

  table: function (name, schema) {
    return new Table(name, schema, this);
  },

  dropTable: function (name) {
    this.query('DROP TABLE IF EXISTS "' + name + '"');
  },

  transaction: function (func) {
    getConn(this); // ensure connection
    var tx = this._weakMap.get(util.thread);
    try {
      if (tx.transaction)
        return func.call(this, tx);

      try {
        tx.transaction = 'COMMIT';
        query(tx.conn, 'BEGIN');
        return func.call(this, tx);
      } catch(ex) {
        tx.transaction = 'ROLLBACK';
        if (ex !== 'abort')
          throw ex;
      } finally {
        var command = tx.transaction;
        tx.transaction = null;
        query(tx.conn, command);
        var onAborts = tx._onAborts;
        if (onAborts) {
          tx._onAborts = null;
          if (command == 'ROLLBACK')
            onAborts.forEach(function (f) {
              f();
            });
        }
      }
    } finally {
      releaseConn(this);
    }
  },
};

function query(conn, text, params) {
  var future = new Future;
  if (params)
    conn.execParams(text, params, wait(future));
  else
    conn.exec(text, wait(future));

  return future.wait();
}

function Table(name, schema, client) {
  var table = this;
  table._name = name;
  table._client = client;
  Object.defineProperty(table, 'schema', {
    get: function () {
      return schema;
    },
    set: function (value) {
      while (table._ready && table._ready !== true) {
        table._ensureTable();
      }
      schema = value;
      if (table._ready) {
        updateSchema(table, schema);
      }
    },
  });
}

Table.prototype = {
  constructor: Table,

  _ensureTable: function () {
    if (this._ready === true) return;

    var future = new Future;

    if (this._ready) {
      var handle = this._ready.onChange(function () {
        future.return();
      });
      try {
        return future.wait();
      } finally {
        handle.stop();
      }
    }

    var subject = this._ready = makeSubject({});

    readColumns(this);
    var schema = this.schema;
    if (this._columns.length === 0) {
      var fields = ['_id varchar(17) PRIMARY KEY'];
      if (schema) {
        for (var col in schema) {
          var spec = jsFieldToPg(col, schema[col], this._client);
          if (col === '_id')
            fields[0] = spec + ' PRIMARY KEY';
          else
            fields.push(spec);
        }
      }

      this._client.query('CREATE TABLE IF NOT EXISTS "'+this._name+'" ('+fields.join(',')+')');
      readColumns(this);
    } else if (schema) {
      updateSchema(this, schema);
    }
    this._ready = true;
    subject.notify();
  },

  transaction: function (func) {
    var table = this;
    return table._client.transaction(function (tx) {
      return func.call(table, tx);
    });
  },

  insert: function (params) {
    this._ensureTable();
    params = toColumns(this, params);

    var sql = 'INSERT INTO "'+this._name+'" ('+params.cols.map(function (col) {
      return '"'+col+'"';
    }).join(',')+') values (' +
          params.cols.map(function (c, i) {return "$"+(i+1)}).join(",")+')';

    return performTransaction(this, sql, params);
  },

  koruUpdate: function (doc, changes) {
    doc = doc.attributes;
    var params = {};
    for (var key in changes) {
      var sc = changes[key];
      for (key in  sc) {
        var di = key.indexOf('.');
        if (di === -1)
          params[key] = doc[key];
        else {
          key = key.substring(0, di);
          if (! params.hasOwnProperty(key))
            params[key] = doc[key];
        }
      }
    }
    var sql = 'UPDATE "'+this._name+'" SET ';
    var set = toColumns(this, params);
    sql += set.cols.map(function (col, i) {
      return '"'+col+'"=$'+(i+1);
    }).join(',');

    set.values.push(doc._id);

    sql += ' WHERE _id=$'+set.values.length;

    return performTransaction(this, sql, set);
  },

  ensureIndex: function (keys, options) {
    this._ensureTable();
    options = options || {};
    var cols = Object.keys(keys);
    var name = this._name+'_'+cols.join('_');
    cols = cols.map(function (col) {
      return '"'+col+(keys[col] === -1 ? '" DESC' : '"');
    });
    var unique = options.unique ? 'UNIQUE ' : '';
    try {
      this._client.query("CREATE "+unique+"INDEX \""+
                         name+'" ON "'+this._name+'" ('+cols.join(',')+")");
    } catch(ex) {
      if (ex.sqlState !== '42P07')
        throw ex;
    }
  },

  update: function (where, params) {
    this._ensureTable();

    var sql = 'UPDATE "'+this._name+'" SET ';

    var set = toColumns(this, params.$set);
    sql += set.cols.map(function (col, i) {
      return '"'+col+'"=$'+(i+1);
    }).join(',');

    where = this.where(where, set.values);

    if (where)
      sql += ' WHERE '+where;

    return performTransaction(this, sql, set);
  },

  where: function (where, whereValues) {
    var table = this;
    var count = whereValues.length;
    return where1(where);

    function where1(where, notable) {
      var whereSql = [];
      for (var key in  where) {
        var value = where[key];
        var splitIndex = key.indexOf(".");
        if (splitIndex !== -1) {
          var remKey = key.slice(splitIndex+1);
          key = key.slice(0,splitIndex);
          var qkey = ['"'+key+'"'];
          remKey.split(".").forEach(function (p) {
            qkey.push("'"+p+ "'");
          });
          qkey = qkey.join("->");
        } else {
          if (key[0] === '$') switch(key) {
          case '$sql':
            whereSql.push(value);
            continue;
          case '$or':
          case '$and':
          case '$nor':
            var parts = [];
            util.forEach(value, function (w) {
              parts.push('('+where1(w)+')');
            });
            whereSql.push('('+parts.join(key === '$and' ? ' AND ' :  ' OR ')+(key === '$nor'? ') IS NOT TRUE' : ')'));
            continue;
          }
          var qkey = '"'+key+'"';
        }
        ++count;

        if (value && typeof value === 'object') {
          switch (notable ? toBaseType(value) : table._colMap[key] ? table._colMap[key].data_type : 'text') {
          case 'ARRAY':
            for(var vk in value) {
              switch(vk) {
              case '$in':
                whereSql.push(qkey+' && $'+ count);
                whereValues.push(aryToSqlStr(value[vk]));
                break;
              case '$nin':
                whereSql.push("NOT("+qkey+' && $'+ count+")");
                whereValues.push(aryToSqlStr(value[vk]));
                break;
              default:
                assertNoDirective(vk);
                equality(value, true);
              }
              break;
            }
            break;

          case 'json':
          case 'jsonb':
            json_comp_value(value, true);
            break;
          default:
            if (value.constructor === Date) {
              equality(value, true);
              continue;
            }
            for(var vk in value) {
              switch(vk) {
              case '$regex':
              case '$options':
                var regex = value.$regex;
                var options = value.$options;
                if (! regex) {
                  --count;
                  continue;
                }
                whereSql.push(qkey+(options && options.indexOf('i') !== -1 ? '~*$': '~$')+count);
                whereValues.push(regex);
                break;
              case '$ne':
                value = value[vk];
                if (value == null) {
                  --count;
                  whereSql.push(qkey+' IS NOT NULL');
                } else {
                  whereSql.push('('+qkey+' <> $'+count+' OR '+qkey+' IS NULL)');
                  whereValues.push(value);
                }
                break;
              case '$gt':
                var op = '>';
              case '$gte':
                op = op || '>=';
              case '$lt':
                op = op || '<';
              case '$lte':
                op = op || '<=';
                whereValues.push(value[vk]);
                whereSql.push(qkey+op+'$'+count);
                break;
              case '$in':
              case '$nin':
                --count;
                value = value[vk];
                if (value.length === 0) {
                  whereSql.push(vk === '$in' ? 'FALSE' : "TRUE");
                } else {
                  var param = [];
                  util.forEach(value, function (v) {
                    param.push('$'+(++count));
                    whereValues.push(v);
                  });
                  whereSql.push(qkey+(vk === '$in' ? ' IN (' : ' NOT IN (')+param.join(',')+')');
                }
                break;
              default:
                assertNoDirective(vk);
                equality(value, true);
              }
              break;
            }
          }
        } else {
          if (value == null) {
            match_null(true);
          } else switch (notable ? toBaseType(value) :
                  table._colMap.hasOwnProperty(key) ? table._colMap[key].data_type : 'error') {
          case 'ARRAY':
            arrayIn(true);
            break;
          case 'object':
          case 'json':
          case 'jsonb':
            json_comp_value(value, true);
            break;
          case 'error':
            throw new Error('Table '+ table._name + ' has no column: ' + key);
          default:
            equality(value, true);
          }
        }
      }

      if (whereSql.length)
        return whereSql.join(' AND ');

      function match_null(affirm) {
        --count;
        whereSql.push(qkey+ (affirm ? ' IS NULL' : 'IS NOT NULL'));
      }

      function equality(value, affirm) {
        whereSql.push(qkey+(affirm ? '=$' : '<>$')+count);
        whereValues.push(value);
      }

      function arrayIn(affirm) {
        whereSql.push('$'+count+(affirm ? ' =' : ' <>')+' ANY ('+qkey+')');
        whereValues.push(value);
      }

      function assertNoDirective(vk) {
        if (vk[0] === '$')
          throw new Error("invalid/unsupported directive: " + vk);
      }

      function json_comp_value(value, affirm) {
        if (value == null)
          match_null(affirm);
        else if (typeof value === 'object') {
          for(var vk in value) {
            switch(vk) {
            case '$ne':
              json_comp_value(value[vk], false);
              break;
            case '$in':
            case '$nin':
              throw new Error(vk + ' not supported for jsonb fields');

            case '$elemMatch':
              var subvalue = value[vk];
              --count;
              var columns = [];
              for (var subcol in subvalue) {
                columns.push(mapType(subcol, subvalue[subcol]));
              }
              whereSql.push((affirm ? '' : 'NOT')+
                            '(jsonb_typeof('+qkey+
                            ') = \'array\' AND EXISTS(SELECT 1 FROM jsonb_to_recordset('+qkey+
                            ') as __x('+columns.join(',')+') where '+where1(subvalue, 'notable')+'))');
              break;
            default:
              assertNoDirective(vk);
              var q = [];
              q.push(qkey+'=$'+count);
              if (Array.isArray(value))
                q.push('EXISTS(SELECT * FROM jsonb_array_elements($'+
                       count+') where value='+qkey+ ')');


              q.push('(jsonb_typeof('+qkey+') = \'array\' AND EXISTS(SELECT * FROM jsonb_array_elements('+
                     qkey+') where value=$'+count+ '))');

              q = q.join(' OR ');
              whereSql.push(affirm ? q : 'NOT('+q+')');
              whereValues.push(value);
            }
            break;
          }
        } else {
          equality(JSON.stringify(value), affirm);
        }
      }
    }
  },

  query: function (where) {
    return queryWhere(this, 'SELECT * FROM "'+this._name+'"', where);
  },

  findOne: function (where, fields) {
    return queryWhere(this, 'SELECT '+selectFields(this, fields)+' FROM "'+this._name+'"',
                      where, ' LIMIT 1')[0];
  },

  find: function (where, options) {
    this._ensureTable();

    var table = this;
    var sql = 'SELECT '+selectFields(this, options && options.fields)+' FROM "'+this._name+'"';


    if (util.isObjEmpty(where))
      return new Cursor(this, sql, null, options);

    var values = [];
    where = table.where(where, values);
    sql = sql+' WHERE '+where;
    return new Cursor(this, sql, values, options);
  },

  exists: function (where) {
    return queryWhere(this, 'SELECT EXISTS (SELECT 1 FROM "'+this._name+'"',
                      where, ')')[0].exists;
  },

  count: function (where) {
    return +queryWhere(this, 'SELECT count(*) FROM "'+this._name+'"',
                      where)[0].count;
  },

  remove: function (where) {
    var table = this;
    return table._client.withConn(function (conn) {
      return queryWhere(table, 'DELETE FROM "'+table._name+'"', where);
    });
  },

  truncate: function () {
    if (this._ready !== true) return;

    var table = this;
    table._client.withConn(function (conn) {
      table._client.query('TRUNCATE TABLE "'+table._name+'"');
    });
  },
};

function selectFields(table, fields) {
  if (! fields) return '*';
  var add;
  var result = ['_id'];
  for (var col in fields) {
    if (add === undefined) {
      add = !! fields[col];
    } else if (add !== !! fields[col])
      throw new Error('fields must be all true or all false');
    if (col !== '_id' && add) {
      result.push('"'+col+'"');
    }
  }
  if (! add) for(var col in table._colMap) {
    if (col === '_id') continue;
    fields.hasOwnProperty(col) || result.push('"'+col+'"');
  }
  return result.join(',');
}

function Cursor(table, sql, values, options) {
  this.table = table;
  this._sql = sql;
  this._values = values;

  if (options) for (var op in options) {
    var func = this[op];
    if (typeof func === 'function')
      func.call(this, options[op]);
  }

}

function initCursor(cursor) {
  if (cursor._name) return;
  var client = cursor.table._client;
  var tx = client._weakMap.get(util.thread);
  var cname = 'c'+(++cursorCount).toString(36);
  var sql = cursor._sql;
  if (cursor._sort) {
    sql += ' ORDER BY '+Object.keys(cursor._sort).map(function (k) {
      return '"'+k+(cursor._sort[k] === -1 ? '" DESC' : '"');
    }).join(',');
  }
  if (cursor._limit) sql+= ' LIMIT '+cursor._limit;

  if (tx && tx.transaction) {
    cursor._inTran = true;
    client.query('DECLARE '+cname+' CURSOR FOR '+sql, cursor._values);
  } else client.transaction(function () {
    getConn(client); // so cursor is valid outside transaction
    client.query('DECLARE '+cname+' CURSOR WITH HOLD FOR '+sql, cursor._values);
  });
  cursor._name = cname;
}

Cursor.prototype = {
  constructor: Cursor,

  close: function () {
    if (this._name) {
      try {
        this.table._client.query('CLOSE '+this._name);
      } finally {
        this._name = null;
        if (this._inTran) {
          this._inTran = null;
        } else {
          releaseConn(this.table._client);
        }
      }
    }
  },

  next: function (count) {
    initCursor(this);
    var c = count === undefined ? 1 : count;
    var result = this.table._client.query('FETCH '+c+' '+this._name);
    return count === undefined ? result[0] : result;
  },

  sort: function (spec) {
    this._sort = spec;
    return this;
  },

  limit: function (value) {
    this._limit = value;
    return this;
  },

  batchSize: function (value) {
    this._batchSize = value;
    // FIXME do we need this for fetch
    return this;
  },

  forEach: function (func) {
    try {
      for(var doc = this.next(); doc; doc = this.next()) {
        func(doc);
      }
    } finally {
      this.close();
    }
  },
};


function queryWhere(table, sql, where, suffix) {
  table._ensureTable();

  if (util.isObjEmpty(where)) {
    if (suffix) sql += suffix;
    return table._client.query(sql);
  }

  var values = [];
  where = table.where(where, values);
  sql = sql+' WHERE '+where;
  if (suffix) sql += suffix;

  return table._client.query(sql, values);
}

function toColumns(table, params) {
  var needCols = {};
  var cols = Object.keys(params);
  var values = new Array(cols.length);
  var colMap = table._colMap;

  util.forEach(cols, function (col, i) {
    var value = params[col];
    if (value === undefined) value = null;
    var desc = colMap[col];
    if (desc) {
      switch (desc.data_type) {
      case 'ARRAY':
        value = aryToSqlStr(value);
        break;
      case 'jsonb':
      case 'json':
        value = JSON.stringify(value);
        break;
      case 'date':
      case 'timestamp with time zone':
      case 'timestamp without time zone':
        value = value && value.toISOString();
        break;
      }
    }
    values[i] = value;

    if (! desc) {
      needCols[col] = mapType(col, params[col]);
    }
  });

  return {needCols: needCols, cols: cols, values: values};
}

function performTransaction(table, sql, params) {
  if (table.schema || util.isObjEmpty(params.needCols)) {
    return table._client.withConn(function (conn) {
      return this.query(sql, params.values);
    });
  }

  return table._client.transaction(function (conn) {
    addColumns(table, params.needCols);
    return this.query(sql, params.values);
  });
}

function toBaseType(value) {
  if (value == null) return 'text';
  switch(typeof(value)) {
  case 'object':
    if (Array.isArray(value)) {
      var type = value.length ? toBaseType(value[0]) : 'text';
      return type+'[]';
    }
    if (match.date.$test(value))
      return 'timestamp with time zone';
    for (var key in value) {
      if (key.slice(0,1) === '$')
        var type = toBaseType(value[key]);
      if (type && type.slice(-2) === '[]')
        return type.slice(0, -2);
      return type;
      break;
    }
    return 'jsonb';
  case 'number':
    if (value === Math.floor(value))
      return 'integer';
    else
      return 'double precision';
  case 'string':
    return 'text';
  }
}

function mapType(col, value) {
  var type = toBaseType(value);
  return jsFieldToPg(col, type);
}

function jsFieldToPg(col, colSchema, client) {
  var defaultVal = '';
  if (typeof colSchema === 'string')
    var type = colSchema;
  else
    var type = colSchema ? colSchema.type : 'text';

  switch(type) {
  case 'string':
    type = 'text';
    break;
  case 'number':
    type = 'double precision';
    break;
  case 'belongs_to':
  case 'id':
  case 'user_id_on_create':
    type = 'varchar(17)';
    break;
  case 'has_many':
    type = 'varchar(17) ARRAY';
    break;
  case 'color':
    type = 'varchar(9)';
    break;
  case 'object':
  case 'baseObject':
    type = 'jsonb';
    break;
  }

  if(typeof colSchema === 'object' && colSchema.default != null) {
    var literal = colSchema.default;
    client.withConn(function (conn) {
      if (type === 'jsonb')
        literal = conn.escapeLiteral(JSON.stringify(literal))+'::jsonb';
      else switch (typeof literal) {
      case 'number':
      case 'boolean':
        break;
      case 'object':
        if (Array.isArray(literal)) {
          literal = conn.escapeLiteral(aryToSqlStr(literal))+'::'+type;
          break;
        }
      default:
        literal = conn.escapeLiteral(literal)+'::'+type;
      }
    });
    defaultVal = ' DEFAULT ' + literal;;
  }
  return '"' + col + '" ' + type + defaultVal;
}

function updateSchema(table, schema) {
  var needCols = {};
  var colMap = table._colMap;
  for (var col in schema) {
    colMap.hasOwnProperty(col) ||
      (needCols[col] = jsFieldToPg(col, schema[col], table._client));
  }

  util.isObjEmpty(needCols) ||
    table.transaction(function () {
      addColumns(table, needCols);
    });
}

function addColumns(table, needCols) {
  var prefix = 'ALTER TABLE "'+table._name+'" ADD COLUMN ';
  var client = table._client;

  client.query(Object.keys(needCols).map(function (col) {
    return prefix + needCols[col];
  }).join(';'));

  readColumns(table);
}

function readColumns(table) {
  var colQuery = "SELECT * FROM information_schema.columns WHERE table_name = '" +
        table._name + "'";
  table._columns = table._client.query(colQuery);
  table._colMap = util.toMap('column_name', null, table._columns);
}

function wait(future) {
  return function (err, result) {
    if (err) {
      future.throw(err);
    }
    else future.return(result);
  };
}

define(function(require) {
  const util   = require('koru/util');
  const driver = require('koru/config!DBDriver');

  const initArgs$ = Symbol();

  const initDbs = dbs=>{
    dbs.list = {};
    dbs.dbId = '';
    dbs.db = undefined;
  };


  class DBS {
    constructor(DBRunner, ...args) {
      this.DBRunner = DBRunner;
      this[initArgs$] = args;
      initDbs(this);
    }

    get current() {
      if (dbBroker.dbId === this.dbId) return this.db;
      this.db = this.list[this.dbId = dbBroker.dbId];
      if (this.db !== undefined) return this.db;
      return this.db = this.list[this.dbId] = new this.DBRunner(...this[initArgs$]);
    }

    stop() {
      const {list} = this;
      initDbs(this);
      for (const id in list) list[id].stop();
    }
  }

  const dbBroker = {
    get db() {
      const {thread} = util;
      return thread.db || (thread.db = driver.defaultDb);
    },
    set db(value) {
      if (value == null) value = driver.defaultDb;
      const {thread} = util;
      thread.db = value;
      thread.dbId = value.name;
    },
    get dbId() {return dbBroker.db.name},

    clearDbId() {dbBroker.db = undefined},

    makeFactory(DBRunner, ...args) {
      return new DBS(DBRunner, ...args);
    },
  };

  return dbBroker;
});

define((require)=>{
  const driver          = require('koru/config!DBDriver');
  const util            = require('koru/util');

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

  class DBRunner {
    constructor() {
      this.db = dbBroker.db;
      this.handles = [];
    }

    stop() {
      const orig = dbBroker.db;
      try {
        dbBroker.db = this.db;
        this.stopped();
      } finally {
        dbBroker.db = orig;
      }
    }

    stopped() {
      for (const h of this.handles)
        h.stop();
      this.handles.length = 0;
    }
  }

  const dbBroker = {
    get db() {
      if (driver === undefined) return;
      const {thread} = util;
      return thread.db || (thread.db = driver.defaultDb);
    },
    set db(value) {
      if (driver === undefined) return;
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

    DBRunner,
  };

  return dbBroker;
});

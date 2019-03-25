define((require, exports, module)=>{
  'use strict';
  return dbBroker =>{

    const stop = isClient ? self =>{
      const orig = dbBroker.dbId;
      try {
        dbBroker.dbId = self.dbId;
        self.stopped();
      } finally {
        dbBroker.dbId = orig;
      }
    } : self =>{
      const orig = dbBroker.db;
      try {
        dbBroker.db = self.db;
        self.stopped();
      } finally {
        dbBroker.db = orig;
      }
    };

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
        if (isServer) this.db = dbBroker.db;
        this.dbId = dbBroker.dbId;
        this.handles = [];
      }

      stop() {
        stop(this);
      }

      stopped() {
        for (const h of this.handles)
          h.stop();
        this.handles.length = 0;
      }
    }


    dbBroker.makeFactory = (DBRunner, ...args)=> new DBS(DBRunner, ...args);

    dbBroker.DBRunner = DBRunner;
  };
});

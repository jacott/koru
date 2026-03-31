define(() => {
  'use strict';
  return (dbBroker) => {
    const stop = isClient
      ? (self) => {
        const orig = dbBroker.dbId;
        try {
          dbBroker.dbId = self.dbId;
          self.stopped();
        } finally {
          dbBroker.dbId = orig;
        }
      }
      : (self) => {
        const orig = dbBroker.db;
        try {
          dbBroker.db = self.db;
          self.stopped();
        } finally {
          dbBroker.db = orig;
        }
      };

    const initArgs$ = Symbol();

    const initDbs = (dbs) => {
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
        return this.db = this.list[this.dbId = dbBroker.dbId] ??= new this.DBRunner(
          ...this[initArgs$],
        );
      }

      remove(dbId) {
        const runner = this.list[dbId];
        if (runner !== undefined) {
          delete this.list[dbId];
          runner.stop();
        }
      }

      stop() {
        const {list} = this;
        for (const id in list) list[id].stop();
        initDbs(this); // This needs to happen after because current might be accessed.
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
        for (const h of this.handles) {
          h.stop();
        }
        this.handles.length = 0;
      }
    }

    dbBroker.makeFactory = (DBRunner, ...args) => new DBS(DBRunner, ...args);

    dbBroker.DBRunner = DBRunner;
  };
});

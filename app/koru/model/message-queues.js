define(function(require, exports, module) {
  const koru            = require('koru');
  const dbBroker        = require('koru/model/db-broker');
  const util            = require('koru/util');

  const dbMap$ = Symbol(), timer$ = Symbol(), queue$ = Symbol();

  const MQDBList = [];

  let db, mqdb;

  const TABLE_SCHEMA = `
CREATE TABLE _message_queue (
    _id bigint NOT NULL,
    name text,
    "dueAt" timestamp without time zone,
    message jsonb
);

CREATE SEQUENCE _message_queue__id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY _message_queue ALTER COLUMN _id
  SET DEFAULT nextval('_message_queue__id_seq'::regclass),
  ADD CONSTRAINT _message_queue_pkey PRIMARY KEY (_id);


CREATE UNIQUE INDEX "_message_queue_name_dueAt__id" ON _message_queue
  USING btree (name, "dueAt", _id);
`;

  const actions = {}, retryIntervals = {};

  const fields = {
    _id: 'bigserial',
    name: 'text',
    dueAt: 'timestamp',
    message: 'jsonb',
  };

  const action = mq=>{
    const {mqdb: {table}, name, [timer$]: timer} = mq;
    timer.handle = -1; timer.ts = 0;
    mq.error = undefined;
    try {
      const rec = table._client.query(`
select _id,"dueAt",message from _message_queue
  where name = $1 and "dueAt" <= $2
  order by "dueAt",_id limit 1;
`, [name, util.newDate()])[0];
      if (rec !== undefined) {
        actions[name]({name, dueAt: rec.dueAt, message: rec.message});
        table._client.query(`delete from _message_queue where _id = $1`, [rec._id]);
      }

      queueNext(mq);
    } catch(ex) {
      koru.unhandledException(ex);
      const retryInterval = retryIntervals[name] || 60*1000;
      if (retryInterval !== -1) {
        timer.handle = 0;
        queueFor(mq, new Date(util.dateNow()+retryInterval));
        mq.error = ex;
      }
    }
  };

  const queueNext = (mq)=>{
    const {mqdb: {table}, name, [timer$]: timer} = mq;

    const nrec = table._client.query(`
select "dueAt" from _message_queue where name = $1
  order by "dueAt",_id limit 1;
`, [name])[0];

      timer.handle = 0;
      if (nrec !== undefined) {
        queueFor(mq, nrec.dueAt);
      }
  };

  const queueFor = (mq, dueAt)=>{
    if (mq.error !== undefined) return;
    const ts = +dueAt;
    if (ts !== ts || ts <= 0) throw new Error("Invalid dueAt");
    const timer = mq[timer$];
    if (timer.handle !== 0) {
      if (timer.ts > ts) {
        koru.clearTimeout(timer.handle);
        timer.handle = 0;
      } else
        return;
    }
    if (timer.handle === 0) {
      timer.ts = ts;
      timer.handle = koru.setTimeout(()=>{
        dbBroker.db = mq.mqdb.table._client;
        action(mq);
      }, Math.min(util.DAY, Math.max(0, +dueAt-util.dateNow())));
    }
  };

  class MQ {
    constructor(mqdb, name) {
      this.mqdb = mqdb;
      this.name = name;
      this[timer$] = {handle: 0, dueAt: 0};
      this.error = undefined;
    }

    add({dueAt=util.newDate(), message}) {
      const {mqdb, name} = this;
      const now = util.dateNow();
      mqdb.table.insert({name, dueAt, message});
      queueFor(this, dueAt);
    }
  }

  class MQDB {
    constructor(db) {
      const table = this.table = db.table('_message_queue', fields);
      table._ensureTable();
      if (table._columns === undefined) {
        db.query(TABLE_SCHEMA);
        table._ensureTable();
      }

      this[queue$] = {};
    }
    getQueue(name) {
      return this[queue$][name] || (this[queue$][name] = new MQ(this, name));
    }
  }

  const getDb = ()=>{
    const tdb = dbBroker.db;
    if (tdb !== db) {
      mqdb = undefined;
      db = tdb;
    }
    return db;
  };

  const getMQDB = ()=>{
    if (getDb() === undefined) return;
    if (mqdb !== undefined) return mqdb;
    mqdb = db[dbMap$];
    if (mqdb !== undefined) return mqdb;

    MQDBList.push(db);

    return db[dbMap$] = mqdb = new MQDB(db);
  };

  const MessageQueues = {
    start() {
      const mqdb = getMQDB();
      for (const name in actions) {
        queueNext(mqdb.getQueue(name));
      }
    },

    stopAll() {
      MQDBList.forEach(db => {
        const queue = db[dbMap$][queue$];
        for (const name in queue) {
          const timers = queue[name][timer$];
          if (timers.handle !== 0) {
            koru.clearTimeout(timers.handle);
            timers.handle = timers.ts = 0;
          }
        }
        delete db[dbMap$];
      });
      MQDBList.length = 0;
      mqdb = db = undefined;
    },
    registerQueue({module, name, action, retryInterval}) {
      if (actions[name] !== undefined) throw new Error(`MessageQueue '${name}' already registered`);
      actions[name] = action;
      if (retryInterval !== undefined)
        retryIntervals[name] = retryInterval;
      module === undefined || module.onUnload(()=>{MessageQueues.deregisterQueue(name)});
    },

    deregisterQueue(name) {
      delete actions[name];
      delete retryIntervals[name];
    },
    getQueue(name) {
      return getMQDB().getQueue(name);
    }
  };

  return MessageQueues;
});

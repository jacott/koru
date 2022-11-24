define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const dbBroker        = require('koru/model/db-broker');
  const TransQueue      = require('koru/model/trans-queue');
  const util            = require('koru/util');

  const {private$} = require('koru/symbols');

  const {hasOwn} = util;

  const timer$ = Symbol(), ready$ = Symbol(), retryInterval$ = Symbol(),
        action$ = Symbol(), dbs$ = Symbol(), queue$ = Symbol();

  const DEFAULT_INTERVAL = 60*1000;

  const TABLE_SCHEMA = `
CREATE TABLE "_message_queue" (
    _id bigint NOT NULL,
    name text COLLATE pg_catalog."C" NOT NULL,
    "dueAt" timestamp without time zone,
    message jsonb
);

CREATE SEQUENCE "_message_queue__id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE ONLY "_message_queue" ALTER COLUMN _id
  SET DEFAULT nextval('"_message_queue__id_seq"'::regclass),
  ADD CONSTRAINT "_message_queue_pkey" PRIMARY KEY (_id);


CREATE UNIQUE INDEX "_message_queue_name_dueAt__id" ON "_message_queue"
  USING btree (name, "dueAt", _id);
`;

  const fields = {
    _id: 'bigserial',
    name: 'text',
    dueAt: 'timestamp',
    message: 'jsonb',
  };

  const action = async (mq) => {
    dbBroker.db = mq.mqdb.table._client;
    const {name, [timer$]: timer,
           mqdb: {[action$]: actions, [retryInterval$]: retryIntervals}} = mq;
    timer.dueAt = 0;
    mq.error = undefined;
    try {
      const [rec] = await mq.peek(1, util.newDate());
      if (rec !== undefined) {
        await actions[name]({_id: rec._id, dueAt: rec.dueAt, message: rec.message}, mq);
        await mq.remove(rec._id);
      }

      timer.handle = undefined;
      return await queueNext(mq);
    } catch (err) {
      const retryInterval = typeof err.retryAfter === 'number'
            ? err.retryAfter
            : retryIntervals[name] ?? DEFAULT_INTERVAL;
      if (err.stack) koru.unhandledException(err);
      if (retryInterval !== -1) {
        timer.handle = undefined;
        queueFor(mq, util.dateNow() + retryInterval);
        mq.error = err;
      }
    }
  };

  const queueNext = async (mq, minStart=0) => {
    const {mqdb: {table}, name, [timer$]: timer} = mq;

    const nrec = (await table._client.query(`
select "dueAt" from "${table._name}" where name = $1
  order by "dueAt",_id limit 1;
`, [name]))[0];

    if (nrec !== undefined) {
      queueFor(mq, Math.max(minStart, nrec.dueAt.getTime()));
    }
  };

  const queueFor = (mq, dueAt) => {
    assert(dueAt >= 0, 'dueAt not >= 0');
    if (mq.error !== undefined) return;
    const timer = mq[timer$];
    if (timer.handle !== undefined) {
      if (timer.dueAt > dueAt) {
        koru.clearTimeout(timer.handle);
      } else {
        return;
      }
    }
    timer.dueAt = dueAt;
    timer.handle = koru.setTimeout(
      () => action(mq), Math.min(util.DAY, Math.max(0, dueAt - util.dateNow())));
  };

  const initTable = async (mqdb) => {
    mqdb[ready$] = true;
    const {table} = mqdb;
    await table._ensureTable();
    if (table._colMap === undefined) {
      await dbBroker.db.query(TABLE_SCHEMA.replace(/_message_queue/g, table._name));
      await table.readColumns();
    }
  };

  class MQ {
    constructor(mqdb, name, startupDelay) {
      this.mqdb = mqdb;
      this.name = name;
      this[timer$] = {handle: undefined, dueAt: 0};
      this.error = undefined;
      this[ready$] = false;
    }

    async init(delay) {
      if (this[ready$]) return;
      this[ready$] = true;
      this.mqdb[ready$] || await initTable(this.mqdb);
      delay ??= this.mqdb[retryInterval$][this.name] ?? DEFAULT_INTERVAL;

      return queueNext(this, delay + util.dateNow());
    }

    deregister() {
      const {name} = this;
      const {[action$]: actions, [retryInterval$]: retryIntervals} = this.mqdb;
      const timer = this[timer$];

      if (timer.handle !== undefined) {
        koru.clearTimeout(timer.handle);
        timer.handle = undefined;
      }

      if (hasOwn(actions, name)) {
        delete actions[name];
        if (hasOwn(retryIntervals, name)) delete retryIntervals[name];
      }

      delete this.mqdb[queue$][name];
    }

    async purge() {
      this.mqdb[ready$] || await initTable(this.mqdb);
      this.deregister();
      await this.mqdb.table.remove({name: this.name});
    }

    async sendNow() {
      this.error = undefined;
      return this[ready$] ? queueNext(this, util.dateNow()) : this.init(0);
    }

    async add({dueAt=util.newDate(), message}) {
      if (dueAt.getTime() !== dueAt.getTime()) throw new Error('Invalid dueAt');
      this[ready$] || await this.init();
      const {mqdb, name} = this;
      const now = util.dateNow();
      await mqdb.table.insert({name, dueAt, message});
      TransQueue.onSuccess(() => queueFor(this, dueAt.getTime()));
    }

    async peek(maxResults=1, dueBefore) {
      this[ready$] || await this.init();
      const extra = dueBefore === undefined ? '' : `and "dueAt" <= '${dueBefore.toISOString()}'`;
      const {table} = this.mqdb;
      return await table._client.query(`
select _id,"dueAt",message from "${table._name}"
  where name = $1 ${extra}
  order by "dueAt",_id limit ${maxResults};
`, [this.name]);
    }

    async remove(_id) {
      this.mqdb[ready$] || await initTable(this.mqdb);
      const {table} = this.mqdb;
      return table._client.query(`delete from "${table._name}" where _id = $1`, [_id]);
    }
  }

  class MQDB {
    constructor(tableName, actions, retryIntervals) {
      const {db} = dbBroker;
      this[action$] = Object.create(actions);
      this[retryInterval$] = Object.create(retryIntervals);
      this.table = db.table(tableName, fields);
      this[ready$] = false;
      this[queue$] = {};
    }

    getQueue(name) {
      if (this[action$][name] === undefined) return;
      return this[queue$][name] ??= new MQ(this, name);
    }

    stop() {
      const queue = this[queue$];
      for (const name in queue) {
        const timers = queue[name][timer$];
        if (timers.handle !== undefined) {
          koru.clearTimeout(timers.handle);
          timers.handle = undefined;
          timers.dueAt = 0;
        }
      }
    }

    registerQueue({name, action, retryInterval}) {
      const {[action$]: actions, [retryInterval$]: retryIntervals} = this;
      if (hasOwn(actions, name)) {
        throw new Error(`Message queue '${name}' already registered`);
      }
      actions[name] = action;
      if (retryInterval !== undefined) {
        retryIntervals[name] = retryInterval;
      }
    }

    deregisterQueue(name) {
      this[queue$][name]?.deregister();
    }
  }

  class MQFactory {
    constructor(tableName) {
      this.tableName = tableName;
      this[dbs$] = dbBroker.makeFactory(
        MQDB,
        tableName,
        this[action$] = Object.create(null),
        this[retryInterval$] = Object.create(null),
      );
    }

    async start() {
      const mqdb = this[dbs$].current;
      for (const name in mqdb[action$]) {
        await mqdb.getQueue(name).init();
      }
    }

    _initTableSchema() {
      return initTable(this[dbs$].current);
    }

    stopAll() {
      this[dbs$].stop();
    }

    registerQueue({module, name, action, retryInterval, local=false}) {
      if (local) {
        this[dbs$].current.registerQueue({name, action, retryInterval});
      } else {
        if (this[action$][name] !== undefined) {
          throw new Error(`MessageQueue '${name}' already registered`);
        }
        this[action$][name] = action;
        if (retryInterval !== undefined) {
          this[retryInterval$][name] = retryInterval;
        }
        module?.onUnload(() => {this.deregisterQueue(name)});
      }
    }

    deregisterQueue(name) {
      delete this[action$][name];
      delete this[retryInterval$][name];
      this[dbs$].current.deregisterQueue(name);
    }

    getQueue(name) {
      return this[dbs$].current.getQueue(name);
    }
  }

  MQFactory[private$] = {
    MQ,
    dbs$,
  };

  return MQFactory;
});
